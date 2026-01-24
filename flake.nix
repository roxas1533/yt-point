{
  description = "YouTube Live Point Counter - Tauri + React + Youtube.js";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        rustToolchain = pkgs.rust-bin.stable.latest.default.override {
          extensions = [ "rust-src" "rust-analyzer" ];
          targets = [ "x86_64-pc-windows-gnu" ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Rust
            rustToolchain
            cargo-tauri

            # bun (Node.js互換ランタイム)
            bun

            # 高速リンカー
            mold
            clang

            # Tauri dependencies (Linux)
            pkg-config
            openssl
            glib
            glib-networking
            gtk3
            libsoup_3
            webkitgtk_4_1
            librsvg

            # SQLite
            sqlite

            # 日本語フォント
            noto-fonts-cjk-sans

            # Windows cross-compilation
            pkgsCross.mingwW64.stdenv.cc
            pkgsCross.mingwW64.windows.pthreads
          ];

          shellHook = ''
            export PKG_CONFIG_PATH="${pkgs.openssl.dev}/lib/pkgconfig:$PKG_CONFIG_PATH"
            export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [
              pkgs.openssl
              pkgs.glib
              pkgs.gtk3
              pkgs.libsoup_3
              pkgs.webkitgtk_4_1
            ]}:$LD_LIBRARY_PATH"
            export FONTCONFIG_FILE="${pkgs.makeFontsConf { fontDirectories = [ pkgs.noto-fonts-cjk-sans ]; }}"

            # GIO TLS support (glib-networking)
            export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules/"

            # WSLg: Force X11 backend for correct WebKitGTK rendering
            export GDK_BACKEND=x11

            echo "yt-point development environment loaded"
            echo "Run 'bun install' and 'bun run tauri:dev' to start development"
          '';
        };
      }
    );
}
