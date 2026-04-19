const db = require('../db');
const jwt = require('jsonwebtoken');
const requestIp = require('request-ip');
const redisClient = require('../db/redis');
const { getCityFromIp, calculateRoughDistance } = require('../utils/geoUtils');

// Logic for POST /api/vaults/anchor
exports.createVault = async (req, res) => {
    console.log('\n[createVault] Incoming body:', req.body);
    const { fileName, fileSize, lat, lon, durationInMinutes=10 } = req.body;

    if (!fileName || fileSize === undefined || lat === undefined || lon === undefined) {
        console.error('[createVault] Missing required fields:', { fileName, fileSize, lat, lon });
        return res.status(400).json({ error: 'Missing required fields: fileName, fileSize, lat, lon' });
    }

    try {
        // In this P2P architecture, the actual file data never reaches the server.
        // We store a placeholder to satisfy the NOT NULL constraint.
        const encryptedDataRef = 'client-side';

        const values = [fileName, fileSize, encryptedDataRef, lon, lat, durationInMinutes];
        console.log('[createVault] Running INSERT with values:', values);

        const query = `
            INSERT INTO vaults (file_name, file_size, encrypted_data_ref, location, expires_at)
            VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), NOW() + ($6 || ' minutes')::interval)
            RETURNING id;
        `;
        const result = await db.query(query, values);
        console.log('[createVault] INSERT result:', result.rows);

        const vaultId = result.rows[0].id;

        // Store in Redis with a 10-minute expiry (600 seconds)
        const redisKey = `active_vault:${vaultId}`;
        console.log('[createVault] Setting Redis key:', redisKey);
        await redisClient.set(redisKey, 'waiting', { EX: 600 });
        console.log('[createVault] Redis set OK. Returning vaultId:', vaultId);

        res.status(201).json({ vaultId });

    } catch (err) {
        console.error('[createVault] ERROR:', err.message);
        console.error('[createVault] Full error:', err);
        res.status(500).json({ error: 'Database error during anchoring', detail: err.message });
    }
};

// Logic for POST /api/vaults/verify
exports.verifyLocation = async (req, res) => {
    console.log('\n[verifyLocation] Incoming body:', req.body);
    const { lat, lon } = req.body;
    const clientIp = requestIp.getClientIp(req);
    console.log('[verifyLocation] Client IP:', clientIp);

    try {
        const roughLocation = await getCityFromIp(clientIp);
        console.log('[verifyLocation] Rough location from IP:', roughLocation);

        if (roughLocation && roughLocation.city !== 'Localhost') {
            const dist = calculateRoughDistance(lat, lon, roughLocation.lat, roughLocation.lon);
            console.log('[verifyLocation] Distance from IP location (m):', dist);
            if (dist > 50000) {
                console.warn('[verifyLocation] BLOCKED: distance exceeds 50km');
                return res.status(403).json({
                    code: 'GEO_SPOOFING',
                    error: 'Location spoofing detected. Your reported GPS coordinates do not match your network location.'
                });
            }
        }

        const token = jwt.sign({ lat, lon }, process.env.JWT_SECRET, { expiresIn: '60s' });
        console.log('[verifyLocation] JWT issued OK');
        res.json({ token });

    } catch (err) {
        console.error('[verifyLocation] ERROR:', err.message);
        res.status(500).json({ error: 'Verification error', detail: err.message });
    }
};

// Logic for GET /api/vaults/:id
exports.openVault = async (req, res) => {
    const { id } = req.params;
    const token = req.headers['x-location-proof'];
    console.log(`\n[openVault] vaultId: ${id}, token present: ${!!token}`);

    if (!token) return res.status(401).json({ error: 'No location proof' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const { lat, lon } = decoded;
        console.log('[openVault] Decoded JWT coords:', { lat, lon });

        const query = `
            SELECT file_name, file_size, encrypted_data_ref FROM vaults
            WHERE id = $1 AND expires_at > NOW()
            AND ST_DWithin(
                location,
                ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography,
                50
            );
        `;
        console.log('[openVault] Running SELECT with:', [id, lon, lat]);
        const result = await db.query(query, [id, lon, lat]);
        console.log('[openVault] Rows returned:', result.rows.length);

        if (result.rows.length === 0) {
            // Distinguish between expired and out-of-range for a better UX
            const checkQuery = `SELECT expires_at FROM vaults WHERE id = $1`;
            const checkResult = await db.query(checkQuery, [id]);
            if (checkResult.rows.length === 0) {
                console.warn('[openVault] BLOCKED: vault does not exist');
                return res.status(403).json({ code: 'GEO_NOT_FOUND', error: 'This vault does not exist or has already been used.' });
            }
            const expired = new Date(checkResult.rows[0].expires_at) < new Date();
            if (expired) {
                console.warn('[openVault] BLOCKED: vault expired');
                return res.status(403).json({ code: 'GEO_EXPIRED', error: 'This vault has expired. Ask the sender to create a new one.' });
            }
            console.warn('[openVault] BLOCKED: recipient is out of geo-fence range');
            return res.status(403).json({ code: 'GEO_OUT_OF_RANGE', error: 'You are outside the geo-fence. You must be within 50 metres of the sender to access this file.' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('[openVault] ERROR:', err.message);
        res.status(401).json({ error: 'Invalid token', detail: err.message });
    }
};