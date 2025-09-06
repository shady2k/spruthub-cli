class Table {
  constructor(options) {
    this.options = options;
    this.rows = [];
  }
  
  push(row) {
    this.rows.push(row);
  }
  
  toString() {
    return 'mocked table output';
  }
}

module.exports = Table;
module.exports.default = Table;