export const createBehaviorEvent = (req, res) => {
  // En EKS, los logs se envían a stdout y son capturados por Fluent Bit -> Loki
  console.log(JSON.stringify({
    service: "event-logger",
    timestamp: new Date().toISOString(),
    event: req.body,
  }));
  res.set("Cache-Control", "no-store");
  res.status(204).send();
};
