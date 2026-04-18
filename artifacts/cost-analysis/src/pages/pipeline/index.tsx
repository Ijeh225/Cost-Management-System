import { useEffect } from "react";
import { useLocation } from "wouter";

export default function PipelinePage() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/operations", { replace: true });
  }, [setLocation]);
  return null;
}
