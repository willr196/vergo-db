import "express-session";

declare module "express-session" {
  interface SessionData {
    // Admin
    isAdmin?: boolean;
    username?: string;
    userId?: string;
    loginTime?: number;
    lastActivity?: number;

    // User (job seekers)
    isUser?: boolean;
    userEmail?: string;
    userLoginTime?: number;
    userLastActivity?: number;

    // Client (companies)
    isClient?: boolean;
    clientId?: string;
    clientEmail?: string;
  }
}