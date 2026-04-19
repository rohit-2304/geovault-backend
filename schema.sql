-- 1. Enable the PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Create the Vaults table
CREATE TABLE vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    encrypted_data_ref TEXT NOT NULL,
    location GEOGRAPHY(Point, 4326) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 3. create a spatial index for fast proximity lookups
CREATE INDEX idx_vaults_location ON vaults USING GIST (location);