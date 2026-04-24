import { HttpException, HttpStatus } from '@nestjs/common';

export class ContractException extends HttpException {
  constructor(message: string, status: HttpStatus, public readonly errorCode?: number) {
    super({ message, errorCode }, status);
  }
}

export class ContractStateConflictException extends ContractException {
  constructor(message: string, errorCode?: number) {
    super(message, HttpStatus.CONFLICT, errorCode);
  }
}

export class ContractValidationException extends ContractException {
  constructor(message: string, errorCode?: number) {
    super(message, HttpStatus.BAD_REQUEST, errorCode);
  }
}

export class ContractResourceExhaustedException extends ContractException {
  constructor(message: string, errorCode?: number) {
    super(message, HttpStatus.FORBIDDEN, errorCode);
  }
}
