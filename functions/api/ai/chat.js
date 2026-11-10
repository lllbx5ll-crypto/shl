import { enforceUserRateLimit, jsonError, requireFirebaseUser, RequestError } from "../../_shared/auth.js";
import { selectAIModel, runTextModel } from "../../_shared/models.js";



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

    const selected = selectAIModel(body?.model);
    const content = await runTextModel(env.AI, selected, [
      { role: "system", content: [
        "أنت ZYQMORA AI، مساعد عربي متخصص في البرمجة وتصميم المواقع وتجربة المستخدم.",
        "أجب باللغة العربية ما لم يطلب المستخدم لغة أخرى. قدّم خطوات واقعية وكوداً صحيحاً.",
        "لا تدّع تنفيذ شيء لم تنفذه؛ لا تعد بدفع أو متجر حقيقي دون خدمات خلفية آمنة.",
        "عند طلب موقع جديد، وجّه المستخدم إلى زر «صمّم موقعي»."
      ].join("\n") },
      ...messages
    ], 1500);
    if (!content) throw new RequestError("لم يُرجع النموذج إجابة.", 502);

    return Response.json({ content, model: selected.id }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return jsonError(error);
  }
}
