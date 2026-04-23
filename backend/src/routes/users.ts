import { Router } from "express";
import { getMe, switchMyActiveRole } from "../controllers/usersController";

const router = Router();

router.get("/me", getMe);
router.patch("/me/active-role", switchMyActiveRole);

export default router;