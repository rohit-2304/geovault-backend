const redisClient = require('./db/redis');
const {Server} = require('socket.io');

const initSocket = (server) => {
    const io = new Server(server,{
        cors:{
            origin:"*",     // replace by frontend url
            methods : ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log('User connnected to signaling server:', socket.id);

        // user enters the waiting room for a specific file
        socket.on('join-vault', async (vaultId) => {
            const activeKey = `active_vault:${vaultId}`;
            const status = await redisClient.get(activeKey);

            if (!status) {
                return socket.emit('error', 'Vault does not exist or has expired');
            }

            socket.join(vaultId);
            console.log(`Socket ${socket.id} joined vault: ${vaultId}`);

            // Add this specific user to a Redis "Set" for this vault
            await redisClient.sAdd(`vault_participants:${vaultId}`, socket.id);
            
            // Set the list to expire so it doesn't stay in RAM forever
            await redisClient.expire(`vault_participants:${vaultId}`, 600);

            // Tell the Sender that a new person has arrived
            const allParticipants = await redisClient.sMembers(`vault_participants:${vaultId}`);
            
            io.to(vaultId).emit('participants-updated', allParticipants);
        });

        // Pass WebRTC handshake data to the other person in the room
        socket.on('signal', (data) => {
            // data should contain { vaultId, signalData}
            const { vaultId, signalData} = data;

            // Broadcast to everyone in the room EXCEPT the sender

            socket.to(vaultId).emit('signal', {
                senderId : socket.id,
                signal : signalData
            });
        });

        socket.on('disconnect', ()=>{
            console.log('User disconnected from Signaling')
        });
    });

    return io;
};

module.exports = initSocket;