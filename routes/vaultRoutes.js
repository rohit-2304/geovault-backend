const express = require('express');
const router = express.Router();
const vaultController = require('../controllers/vaultController');

router.post('/anchor', vaultController.createVault);
router.post('/verify', vaultController.verifyLocation);
router.get('/:id', vaultController.openVault);

module.exports = router;