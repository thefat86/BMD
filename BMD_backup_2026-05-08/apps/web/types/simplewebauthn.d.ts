/**
 * Stub types pour @simplewebauthn/browser tant que la dépendance n'est
 * pas installée (sandbox sans accès npm). Quand l'utilisateur lance
 * `npm install`, les vraies déclarations TypeScript du package sont
 * prioritaires (auto-shadowing par le résolveur TS).
 *
 * Ces stubs ne servent QU'au typecheck — ils ne fournissent pas
 * d'implémentation runtime. L'import réel échouera tant que le
 * package n'est pas installé.
 */
declare module "@simplewebauthn/browser" {
  export function startRegistration(args: {
    optionsJSON: any;
    useAutoRegister?: boolean;
  }): Promise<any>;

  export function startAuthentication(args: {
    optionsJSON: any;
    useBrowserAutofill?: boolean;
  }): Promise<any>;

  export function browserSupportsWebAuthn(): boolean;
  export function platformAuthenticatorIsAvailable(): Promise<boolean>;
}
