// backend/utils/budget.js
// Recalculates the `activities` bucket (and therefore `total`) of a trip's
// estimatedBudget ledger from the actual itinerary contents. Called any
// time activities are added, removed, or a single day is regenerated, so
// the budget ledger never drifts out of sync with the itinerary.

function recalcActivitiesBudget(trip) {
  const activitiesTotal = (trip.itinerary || []).reduce((daySum, day) => {
    const dayTotal = (day.activities || []).reduce(
      (s, a) => s + (Number(a.estimatedCostUSD) || 0),
      0
    );
    return daySum + dayTotal;
  }, 0);

  if (!trip.estimatedBudget) {
    trip.estimatedBudget = { transport: 0, accommodation: 0, food: 0, activities: 0, total: 0 };
  }

  trip.estimatedBudget.activities = activitiesTotal;
  trip.estimatedBudget.total =
    (trip.estimatedBudget.transport || 0) +
    (trip.estimatedBudget.accommodation || 0) +
    (trip.estimatedBudget.food || 0) +
    activitiesTotal;

  return trip;
}

module.exports = { recalcActivitiesBudget };
