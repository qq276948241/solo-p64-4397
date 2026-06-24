function success(res, data, message = '成功') {
  return res.json({
    code: 0,
    message,
    data
  });
}

function fail(res, errorObj, statusCode = 400) {
  return res.status(statusCode).json({
    code: errorObj.code,
    message: errorObj.message,
    data: null
  });
}

module.exports = { success, fail };
