const authenticator = {
  generateSecret: jest.fn().mockReturnValue('MOCKSECRET'),
  keyuri: jest.fn().mockReturnValue('otpauth://totp/Ahjoorxmr:test%40example.com?secret=MOCKSECRET&issuer=Ahjoorxmr'),
  verify: jest.fn().mockReturnValue(false),
};

module.exports = { authenticator };
