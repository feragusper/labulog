// Minimal typings for the Google Identity Services client loaded via <script>.
interface GoogleCredentialResponse {
  credential: string;
}

interface GoogleIdConfig {
  client_id: string;
  callback: (resp: GoogleCredentialResponse) => void;
}

interface GoogleButtonOptions {
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  width?: number;
  text?: "signin_with" | "signup_with" | "continue_with";
  shape?: "rectangular" | "pill";
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: GoogleIdConfig) => void;
        renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
      };
    };
  };
}
