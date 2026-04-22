const QRCode = {
  toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,MOCKQR'),
};

module.exports = QRCode;
