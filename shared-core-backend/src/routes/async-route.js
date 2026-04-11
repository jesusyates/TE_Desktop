const { toAppError } = require("../utils/routeError");

function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => next(toAppError(err)));
  };
}

module.exports = { asyncRoute };
