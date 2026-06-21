// backend/routes/tripRoutes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  createTripAI,
  getTrips,
  getTripById,
  updateTrip,
  deleteTrip,
  addActivity,
  removeActivity,
  regenerateDay,
  generatePackingList,
  updatePackingItem
} = require('../controllers/tripController');

// Every trip route requires a valid, decoded session — req.user.id is
// then used by every controller below to enforce strict tenant isolation.
router.use(authMiddleware);

router.get('/', getTrips);
router.post('/generate', createTripAI);

router.get('/:id', getTripById);
router.put('/:id', updateTrip);
router.delete('/:id', deleteTrip);

router.post('/:id/activities', addActivity);
router.delete('/:id/activities/:dayNumber/:activityIndex', removeActivity);

router.post('/:id/days/:dayNumber/regenerate', regenerateDay);

router.post('/:id/packing/generate', generatePackingList);
router.patch('/:id/packing/:itemIndex', updatePackingItem);

module.exports = router;
