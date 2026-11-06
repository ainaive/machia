import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ApprovalNotice } from "./ApprovalNotice";

describe("ApprovalNotice", () => {
  test("says bots run in bubblewrap when the server reports the sandbox", () => {
    const html = renderToStaticMarkup(<ApprovalNotice sandboxed />);
    expect(html).toContain("bubblewrap 沙箱");
    expect(html).not.toContain("未开启沙箱");
  });

  test("warns that approval is a trust decision when the sandbox is off", () => {
    const html = renderToStaticMarkup(<ApprovalNotice sandboxed={false} />);
    expect(html).toContain("未开启沙箱");
    expect(html).toContain("审批即信任这一版源码");
    expect(html).not.toContain("bubblewrap 沙箱");
  });

  test("doesn't promise a sandbox when the server mode is unknown", () => {
    const html = renderToStaticMarkup(<ApprovalNotice sandboxed={null} />);
    expect(html).toContain("取决于服务器配置");
    expect(html).not.toContain("bubblewrap 沙箱");
    expect(html).not.toContain("未开启沙箱");
  });
});
