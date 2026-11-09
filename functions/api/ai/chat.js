import { enforceUserRateLimit, jsonError, requireFirebaseUser, RequestError } from "../../_shared/auth.js";

const MODEL = "@cf/qwen/qwen2.5-coder-32b-instruct";

export async function onRequestPost({ request, env }) {
  try {
    const user = await requireFirebaseUser(request);
    enforceUserRateLimit(user.uid, 10);

    if (!env.AI) {
      throw new RequestError("لم يتم تفعيل ربط Workers AI في Cloudflare بعد. أضف AI binding ثم أعد النشر.", 503);
    }

    const body = await request.json().catch(() => null);
    const input = body?.messages;
    if (!Array.isArray(input) || input.length < 1 || input.length > 12) {
      throw new RequestError("صيغة المحادثة غير صحيحة. أرسل من رسالة إلى 12 رسالة.", 400);
    }

    const messages = input.map((item) => {
      if (!["user", "assistant"].includes(item?.role) || typeof item.content !== "string") {
        throw new RequestError("إحدى رسائل المحادثة غير صالحة.", 400);
      }
      if (item.content.length > 2200) {
        throw new RequestError("إحدى الرسائل أطول من الحد المسموح.", 413);
      }
      return { role: item.role, content: item.content };
    });

    const result = await env.AI.run(MODEL, {
      messages: [
        {
          role: "system",
          content: [
            "أنت ZYQMORA AI، مساعد عربي متخصص في البرمجة وتصميم المواقع وتجربة المستخدم.",
            "أجب باللغة العربية ما لم يطلب المستخدم لغة أخرى. قدّم حلولاً عملية وكوداً صحيحاً عند الحاجة.",
            "كن واضحاً ولا تدّع تنفيذ أو نشر شيء لم تنفذه فعلياً.",
            "عند طلب إنشاء موقع كامل، وجّه المستخدم إلى زر إنشاء الموقع في مساحة البناء."
          ].join("\n")
        },
        ...messages
      ],
      stream: false,
      max_tokens: 1100,
      temperature: 0.35
    });

    const content = typeof result?.response === "string" ? result.response.trim() : "";
    if (!content) throw new RequestError("لم يُرجع النموذج إجابة. حاول مرة أخرى.", 502);

    return Response.json({ content, model: MODEL }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
