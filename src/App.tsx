import { useEffect } from "react";
import { ContextMenuProvider } from "./components/context-menu/ContextMenuProvider";
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
      <ContextMenuProvider>
        <Workbench />
      </ContextMenuProvider>
    </DialogProvider>
  );
}

export default App;
