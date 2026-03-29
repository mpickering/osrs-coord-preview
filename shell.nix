{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  packages = with pkgs; [
    gcc
    gnumake
    nodejs_20
    pkg-config
    python3
    vips
  ];

  shellHook = ''
    echo "OSRS coordinate preview dev shell"
    echo "Node: $(node --version)"
    echo "npm: $(npm --version)"
  '';
}
