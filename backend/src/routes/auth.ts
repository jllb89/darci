import { Router } from "express";
import { login, logout, refresh, signup } from "../controllers/authController";

const router = Router();

router.post("/login", login);
router.post("/logout", logout);
router.post("/refresh", refresh);
router.post("/signup", signup);

export default router;
