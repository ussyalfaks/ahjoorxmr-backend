const bcrypt = {
  compare: jest.fn(),
  hash: jest.fn().mockResolvedValue('hashed-value'),
  hashSync: jest.fn().mockReturnValue('hashed-sync-value'),
};

module.exports = bcrypt;
