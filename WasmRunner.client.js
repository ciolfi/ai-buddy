// In a client component (e.g., WasmRunner.client.js)
'use client'; // Required for Next.js app router

import { useEffect, useState } from 'react';

export default function WasmRunner() {
  const [wasm, setWasm] = useState(null);

  useEffect(() => {
    // fetch('/module.wasm') // Fetch the file from the public directory
    fetch('/public/models/SmolLM-360M-Instruct-q4f16_1-ctx2k_cs1k-webgpu.wasm') // Fetch the file from the public directory
      .then(res => res.arrayBuffer())
      .then(bytes => WebAssembly.instantiate(bytes))
      .then(result => {
        setWasm(result.instance.exports);
      })
      .catch(console.error);
  }, []);

  if (!wasm) {
    return <div>Loading Wasm...</div>;
  }

  // Use your Wasm functions
  return <div>Wasm loaded. Example function call: {wasm.add_one(10)}</div>;
}
