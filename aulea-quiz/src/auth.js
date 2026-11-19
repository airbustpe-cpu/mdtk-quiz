// Browser auth wrapper around Netlify Identity. Bundled to public/auth.js by `npm run build`.
import {
  login, logout, getUser, handleAuthCallback, acceptInvite,
  requestPasswordRecovery, updateUser,
} from "@netlify/identity";

window.NAuth = { login, logout, getUser, handleAuthCallback, acceptInvite, requestPasswordRecovery, updateUser };
