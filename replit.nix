{pkgs}: {
  deps = [
    pkgs.gcc
    pkgs.pkg-config
    pkgs.vips
    pkgs.python3
    pkgs.ffmpeg
    pkgs.pm2
    pkgs.unzip
  ];
}
