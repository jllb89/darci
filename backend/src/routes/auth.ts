import { Router } from "express";
import {
	login,
	logout,
	requestEmailOtp,
	requestMagicLink,
	refresh,
	requestPasswordRecovery,
	resendConfirmation,
	resetPassword,
	signup,
	syncSession,
	verifyEmailOtp,
} from "../controllers/authController";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.post("/magic-link", requestMagicLink);
router.post("/otp/start", requestEmailOtp);
router.post("/otp/verify", verifyEmailOtp);
router.post("/password/recovery", requestPasswordRecovery);
router.post("/password/reset", resetPassword);
router.post("/refresh", refresh);
router.post("/resend-confirmation", resendConfirmation);
router.post("/session/sync", syncSession);
router.post("/signup", signup);

export default router;
