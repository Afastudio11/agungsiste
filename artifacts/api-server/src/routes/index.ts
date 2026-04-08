import { Router, type IRouter } from "express";
import healthRouter from "./health";
import eventsRouter from "./events";
import participantsRouter from "./participants";
import ktpRouter from "./ktp";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/events", eventsRouter);
router.use("/participants", participantsRouter);
router.use("/ktp", ktpRouter);
router.use("/dashboard", dashboardRouter);

export default router;
