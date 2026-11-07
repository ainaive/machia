/**
 * The trust message shown above a contest's entry list. It follows the
 * server's actual sandbox mode: saying "no sandbox" on a hardened host (or
 * the reverse) gives players the wrong idea of what approval protects.
 */
export function ApprovalNotice({ sandboxed }: { sandboxed: boolean | null }) {
  return (
    <p className="mb-6 max-w-2xl text-sm text-ink/65">
      {sandboxed === true ? (
        <>
          管理员查看并审阅提交的 Node Bot 代码后开赛。当前服务器在{" "}
          <strong>bubblewrap 沙箱</strong>中运行 Bot：无网络、只能看到自己的目录（只读）。
          审批仍是信任决定，但代码接触不到服务器数据或其他选手。
        </>
      ) : sandboxed === false ? (
        <>
          管理员查看并审阅提交的 Node Bot 代码后开赛。当前服务器
          <strong>未开启沙箱</strong>：Bot 与服务器共享文件系统和网络，审批即信任这一版源码。
          生产环境请按部署文档启用 bwrap。
        </>
      ) : (
        <>
          管理员查看并审阅提交的 Node Bot 代码后开赛。Bot
          是否在沙箱中运行取决于服务器配置；审批即信任这一版源码。
        </>
      )}
    </p>
  );
}
