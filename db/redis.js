const redis = require('redis');

const client = redis.createClient({
    url : process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.log('Redis Client Error', err));

// Connect to the Redis instance
(async () => {
    await client.connect();
    console.log("Redis connected for ephemeral state");
}) ();

module.exports = client;