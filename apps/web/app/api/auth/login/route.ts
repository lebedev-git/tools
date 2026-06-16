import { signToken } from "../../../../lib/auth";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();
    
    const adminUser = process.env.ADMIN_USER;
    const adminPass = process.env.ADMIN_PASS;

    if (!adminUser || !adminPass) {
      console.error("ADMIN_USER or ADMIN_PASS not configured in the environment.");
      return Response.json(
        { status: "error", message: "Панель администратора не настроена (отсутствуют ADMIN_USER или ADMIN_PASS)" },
        { status: 500 }
      );
    }

    if (username === adminUser && password === adminPass) {
      const secret = process.env.SESSION_SECRET ?? "default_secret_please_change_in_production";
      const token = await signToken({ username, exp: Date.now() + 24 * 60 * 60 * 1000 }, secret);
      
      const cookieStore = await cookies();
      cookieStore.set({
        name: "session",
        value: token,
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 86400,
        secure: false
      });

      return Response.json({ status: "success", authenticated: true });
    } else {
      return Response.json({ status: "error", message: "Неверный логин или пароль" }, { status: 401 });
    }
  } catch (err) {
    return Response.json(
      { status: "error", message: "Неверный формат запроса." },
      { status: 400 }
    );
  }
}
