export interface ZuploContext {
  log: {
    info: (...args: any[]) => void;
    error: (...args: any[]) => void;
    warn: (...args: any[]) => void;
  };
  [key: string]: any;
}

export interface ZuploRequest extends Request {
  user?: {
    sub?: string;
    data?: Record<string, any>;
  };
  [key: string]: any;
}

export const environment: Record<string, string | undefined>;
