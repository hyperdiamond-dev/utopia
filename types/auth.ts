// src/types/auth.ts
export interface CreateUserResponse {
  success: boolean;
  credentials: {
    username: string;
    password: string;
  };
  message: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    uuid: string;
    username: string;
  };
}

export interface JWTPayload {
  uuid: string;
  friendlyAlias: string;
  firebaseUid: string;
  iat: number;
  exp: number;
}
