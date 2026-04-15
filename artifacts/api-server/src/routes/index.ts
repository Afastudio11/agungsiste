import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import participantsRouter from "./participants";
import ktpRouter from "./ktp";
import dashboardRouter from "./dashboard";
import authRouter from "./auth";
import usersRouter from "./users";
import pemetaanRouter from "./pemetaan";
import prizesRouter from "./prizes";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/events", eventsRouter);
router.use("/participants", participantsRouter);
router.use("/ktp", ktpRouter);
router.use("/dashboard", dashboardRouter);
router.use("/pemetaan", pemetaanRouter);
router.use("/prizes", prizesRouter);

export default router;
