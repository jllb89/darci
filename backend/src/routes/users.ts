import { Router } from "express";
import { deleteMe, getMe, switchMyActiveRole, updateMe } from "../controllers/usersController";
import {
	getMyNotaryApplication,
	getMyNotaryProfileHandler,
	submitMyNotaryApplication,
	updateMyNotaryProfileHandler,
} from "../controllers/notaryProfileController";

const router = Router();

router.get("/me", getMe);
router.patch("/me", updateMe);
router.delete("/me", deleteMe);
router.patch("/me/active-role", switchMyActiveRole);
router.get("/me/notary-application", getMyNotaryApplication);
router.post("/me/notary-application", submitMyNotaryApplication);
router.get("/me/notary-profile", getMyNotaryProfileHandler);
router.patch("/me/notary-profile", updateMyNotaryProfileHandler);

export default router;