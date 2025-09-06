// Mock keytar for testing
module.exports = {
  setPassword: jest.fn().mockResolvedValue(undefined),
  getPassword: jest.fn().mockResolvedValue(null),
  deletePassword: jest.fn().mockResolvedValue(true),
  findCredentials: jest.fn().mockResolvedValue([]),
  findPassword: jest.fn().mockResolvedValue(null)
};