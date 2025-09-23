{ pkgs }: {
  deps = [
    pkgs.nodejs-18_x
    pkgs.nodePackages.pnpm
    pkgs.nodePackages.typescript
    pkgs.nodePackages.typescript-language-server
    pkgs.postgresql_14
    pkgs.redis
  ];
}
