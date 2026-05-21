/**
 * Stub types pour @simplewebauthn/server tant que le package n'est pas
 * installé via `npm install` (sandbox sans accès registry npm).
 * Les vraies déclarations TS du package sont prioritaires une fois
 * installées.
 */
declare module "@simplewebauthn/server" {
  export interface RegistrationResponseJSON {
    id: string;
    rawId: string;
    response: {
      attestationObject: string;
      clientDataJSON: string;
      transports?: string[];
      publicKey?: string;
      publicKeyAlgorithm?: number;
      authenticatorData?: string;
    };
    authenticatorAttachment?: string;
    clientExtensionResults?: Record<string, unknown>;
    type: "public-key";
  }

  export interface AuthenticationResponseJSON {
    id: string;
    rawId: string;
    response: {
      authenticatorData: string;
      clientDataJSON: string;
      signature: string;
      userHandle?: string;
    };
    authenticatorAttachment?: string;
    clientExtensionResults?: Record<string, unknown>;
    type: "public-key";
  }

  export interface VerifiedRegistrationResponse {
    verified: boolean;
    registrationInfo?: {
      credential: {
        id: string;
        publicKey: Uint8Array;
        counter: number;
      };
      aaguid?: string;
      [k: string]: unknown;
    };
  }

  export interface VerifiedAuthenticationResponse {
    verified: boolean;
    authenticationInfo: {
      newCounter: number;
      credentialID?: string;
      [k: string]: unknown;
    };
  }

  export function generateRegistrationOptions(opts: {
    rpName: string;
    rpID: string;
    userName: string;
    userID?: Uint8Array;
    attestationType?: "none" | "direct" | "indirect" | "enterprise";
    excludeCredentials?: Array<{ id: string; transports?: string[] }>;
    authenticatorSelection?: {
      authenticatorAttachment?: "platform" | "cross-platform";
      residentKey?: "required" | "preferred" | "discouraged";
      requireResidentKey?: boolean;
      userVerification?: "required" | "preferred" | "discouraged";
    };
    supportedAlgorithmIDs?: number[];
    timeout?: number;
  }): Promise<{ challenge: string; [k: string]: unknown }>;

  export function generateAuthenticationOptions(opts: {
    rpID: string;
    allowCredentials?: Array<{ id: string; transports?: string[] }>;
    userVerification?: "required" | "preferred" | "discouraged";
    timeout?: number;
  }): Promise<{ challenge: string; [k: string]: unknown }>;

  export function verifyRegistrationResponse(args: {
    response: RegistrationResponseJSON;
    expectedChallenge: string;
    expectedOrigin: string | string[];
    expectedRPID: string | string[];
    requireUserVerification?: boolean;
  }): Promise<VerifiedRegistrationResponse>;

  export function verifyAuthenticationResponse(args: {
    response: AuthenticationResponseJSON;
    expectedChallenge: string;
    expectedOrigin: string | string[];
    expectedRPID: string | string[];
    credential: {
      id: string;
      publicKey: Uint8Array;
      counter: number;
      transports?: string[];
    };
    requireUserVerification?: boolean;
  }): Promise<VerifiedAuthenticationResponse>;
}
