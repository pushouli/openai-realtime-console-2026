/**
 * 部署专属工具 —— 小车（car）。
 *
 * 这是"部署槽"文件：main 分支上它是空壳，各部署分支整个替换掉它。
 * 这样部署分支的代码差异就只有这一个文件，`git merge main` 永远不会在这里
 * 冲突——git 只会看到 main 从没动过它。
 *
 * 对应的 main 版本长这样（合并时如果这里出现冲突，说明有人在 main 上改了它，
 * 那是不该发生的）：
 *
 *     export const deploymentTools = [];
 *
 * 工具的形状是 { definition, createHandler }，见 ./index.js 顶部说明。
 */

// 小车控制服务的地址。"/" 表示与页面同源，或由开发服务器转发。
const CAR_ENDPOINT = import.meta.env.VITE_CAR_ENDPOINT ?? "/";

const executePython = {
  definition: {
    type: "function",
    name: "execute_python",
    description: "执行指定的 Python 代码。",
    parameters: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: `
              要执行的 Python 代码。可使用以下内置函数：
              你可以在代码中设置名为 result 的变量，其值将在代码执行完成后被自动提取作为最终结果返回。

              1. time.sleep(seconds: float)
                - 暂停指定的秒数。

              2. motion.walk(left: float, right: float)
                - 控制履带车行走。
                - 参数说明：
                  - left 和 right 分别表示左右履带的速度（单位：毫米/秒）
                  - 0 表示停止，负数表示后退。

              3. hand_gesture.start(callback: Callable[[list[int]], None])
                - 启动手势检测，每次调用都应传入新的回调函数。
                - 每当识别到手势时，会调用 callback，传入一个包含 5 个元素的列表：
                  - 列表依次表示拇指、食指、中指、无名指和小指是否伸出（1 表示伸出，0 表示未伸出）
                  - 如果没有检测到手，则传入空列表 []
                - 示例代码：
                  def print_fingers(fingers: list[int]) -> None:
                      print(f"Detected fingers: {fingers}")

                  hand_gesture.start(print_fingers)

              4. hand_gesture.stop()

              5. hand_distance.start(callback: Callable[[float], None])
                - 启动“捏合手势”手势检测。每当用户比出一个拇指和食指之间的间距时，会调用 callback。
                - 例如用户“比个间距”，数值大表示间距大。
                - 参数说明：
                  - 回调函数接收一个 float 类型的值，表示拇指和食指之间的相对距离，范围为 0（最接近）到 100（最远）。
                - 示例：
                  def print_percent(percent: float) -> None:
                      print(f"Detected percent: {percent}")

                  hand_distance.start(print_percent)

              6. hand_distance.stop()
                - 停止捏合手势的相对检测。

              7. headlight.set_brightness(left: int, right: int)
                - 设置左右两个大灯的亮度。
                - 参数说明：
                  - left 表示左边大灯的亮度，范围是 0（关闭）到 100（最亮）
                  - right 表示右边大灯的亮度，范围也是 0 到 100
                - 你可以分别调节左右灯的亮度，比如一边亮一边暗。
                - 示例：
                  headlight.set_brightness(left=100, right=50)

              8. traffic_light.start(callback: Callable[[str], None])
                - 启动信号灯状态检测。当检测到信号灯变化时，会调用 callback。
                - 回调函数接收一个字符串类型的参数，可能的值有：
                  - "green"：绿灯亮
                  - "red"：红灯亮
                  - ""（空字符串）：未检测到信号灯
                - 示例：
                  def on_traffic_light_change(state: str) -> None:
                      print(f"Current light: {state}")

                  traffic_light.start(on_traffic_light_change)

              9. traffic_light.stop()

              10. front_distance.start(callback: Callable[[int], None])
                - 启动前方距离检测功能。
                - 系统会监测车前方有没有障碍物，并通过回调告诉你前方的距离。
                - 回调函数会收到一个整数：
                  - 是正数，表示车前方物体的距离（单位：厘米）
                  - 是 -1，表示前方没有检测到任何物体
                - 示例：
                  def on_front_distance(d: int):
                      if d == -1:
                          print("前面没有东西")
                      else:
                          print(f"前方距离：{d} 厘米")

                  front_distance.start(on_front_distance)

              11. front_distance.stop()
                - 停止检测前方的距离。
`,
        },
      },
      required: ["code"],
    },
  },
  createHandler: () => async ({ code }) => {
    const response = await fetch(`${CAR_ENDPOINT}api/exec`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    return await response.json();
  },
};

const seeWithCamera = {
  definition: {
    type: "function",
    name: "see_with_camera",
    description:
      "通过摄像头拍下当前画面并亲眼观察。当用户让你看看、找东西、认东西，或者问你眼前是什么情况时调用。调用之后你会真正看到这张照片，请用口语化的方式说出你看到的内容，像是在和人聊天一样。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  createHandler: ({ addConversationItem }) => async () => {
    // GET /api/visual 只拍照，返回 { image: base64 JPEG }。
    // 同一路由的 POST 是老路径：带 prompt 交给 Dify 视觉工作流、返回文字分析。
    // 那条留着没动，但这里不用——原生图像输入比读转述强。
    const response = await fetch(`${CAR_ENDPOINT}api/visual`);

    // 拿不到 JSON 说明根本没到小车服务（代理报错、地址配错，或者小车还跑着
    // 没有 GET 入口的旧固件）。不挡一下的话 .json() 直接抛，工具调用整个
    // 失败、模型无话可说。
    const body = await response.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return { error: `摄像头服务没有正常响应（${response.status}）：${body}` };
    }

    // 没有 image 就是拍照失败，小车侧会给 { error: "拍照失败：..." }。
    // 原样交回给模型，它能把这句话说出来。
    if (!data?.image) {
      return data;
    }

    // 作为一条用户消息插入对话，让语音模型带着完整上下文亲眼看这张图，
    // 而不是读另一个模型的转述。这样追问同一张图也不用重拍。
    addConversationItem({
      type: "message",
      role: "user",
      content: [
        {
          type: "input_image",
          image_url: `data:image/jpeg;base64,${data.image}`,
        },
      ],
    });
    return { ok: true };
  },
};

// 前方距离检测。老项目里是主动关掉的（2025-06-05，提交 8290a48
// 「注释掉前方距离检测工具的代码」），照原样搬过来留着。
//
// 需要时取消注释并加进下面的 deploymentTools。后端 /api/front_distance 是通的
// （FrontDistanceController → FrontDistance.get()），不带请求体，返回
// { distance: 厘米 }，-1 表示没检测到东西。
//
// 注意它和 execute_python 里的 front_distance.start(callback) 不是一回事：
// 那个是持续回调，这个是一次性取值。而 /api/exec 进来时会 stop 掉所有检测，
// 两者混用要留意谁把谁关了。
//
// const frontDistance = {
//   definition: {
//     type: "function",
//     name: "front_distance",
//     description:
//       "检测小车前方与物体的距离，返回值单位为厘米，-1 表示没有检测到物体。",
//     parameters: {
//       type: "object",
//       properties: {},
//       required: [],
//     },
//   },
//   createHandler: () => async () => {
//     const response = await fetch(`${CAR_ENDPOINT}api/front_distance`, {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({}),
//     });
//     return await response.json();
//   },
// };

export const deploymentTools = [executePython, seeWithCamera];
