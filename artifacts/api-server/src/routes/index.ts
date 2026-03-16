import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import { authRouter } from "./auth.js";
import { usersRouter } from "./users.js";
import { containersRouter } from "./containers.js";
import { approvalsRouter } from "./approvals.js";
import { myTasksRouter } from "./my-tasks.js";
import { analyticsRouter } from "./analytics.js";
import { reportsRouter } from "./reports.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(containersRouter);
router.use(approvalsRouter);
router.use(myTasksRouter);
router.use(analyticsRouter);
router.use(reportsRouter);

export default router;
