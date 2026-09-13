import { NextRequest, NextResponse } from "next/server";
import { Socket } from "net";

function checkTcpConnection(address: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    const timeout = 5000;

    socket.setTimeout(timeout);

    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("error", () => {
      resolve(false);
    });

    socket.connect(port, address);
  });
}

export async function POST(req: NextRequest) {
  try {
    const { address, port } = await req.json();

    if (!address) {
      return NextResponse.json(
        { error: "Address is required" },
        { status: 400 }
      );
    }

    // Porta padrão baseada no tipo de serviço
    let portToCheck = port;
    if (!portToCheck) {
      // Se não especificou porta, tenta HTTP/HTTPS
      portToCheck = 80;
    }

    // Tenta conexão TCP
    const online = await checkTcpConnection(address, portToCheck);
    return NextResponse.json({ online });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
