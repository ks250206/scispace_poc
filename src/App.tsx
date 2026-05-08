import { useEffect } from "react";
import { DialogProvider } from "./components/dialog/DialogProvider";
import { Workbench } from "./components/Workbench";
import { useScispaceStore } from "./store/scispaceStore";
import "./App.css";

function App() {
  const initialized = useScispaceStore((state) => state.initialized);
  const initialize = useScispaceStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  if (!initialized) {
    return <div className="loading-screen">Loading SciSpace...</div>;
  }

  return (
    <DialogProvider>
      <Workbench />
    </DialogProvider>
  );
}

export default App;
