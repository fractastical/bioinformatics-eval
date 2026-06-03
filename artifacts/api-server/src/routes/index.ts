import { Router, type IRouter } from "express";
import healthRouter from "./health";
import evaluationsRouter from "./evaluations";
import codeAnalysesRouter from "./codeAnalyses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(evaluationsRouter);
router.use("/evaluations/:id/code-analyses", codeAnalysesRouter);

export default router;
