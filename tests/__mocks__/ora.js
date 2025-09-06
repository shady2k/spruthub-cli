module.exports = {
  default: function ora() {
    return {
      start: () => ({ 
        succeed: () => {},
        fail: () => {},
        stop: () => {},
        text: ''
      }),
      succeed: () => {},
      fail: () => {},
      stop: () => {},
      text: ''
    };
  }
};