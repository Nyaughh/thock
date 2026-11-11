// Reads one command per line on stdin and injects it with SendInput.
// Compiled at startup by helper.ps1 (Add-Type), so keep this to C# 5.
//
//   k <vk> <1|0>     key down / up
//   m <dx> <dy>      relative mouse move
//   b <0|1|2> <1|0>  left / right / middle button down / up
//   w <dy> <dx>      wheel (120 = one notch)
//   q <vk>           query key state -> "s <vk> <down> <toggled>"
using System;
using System.Globalization;
using System.Runtime.InteropServices;

namespace Thock
{
    public static class Injector
    {
        [StructLayout(LayoutKind.Sequential)]
        struct MOUSEINPUT { public int dx; public int dy; public int mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

        [StructLayout(LayoutKind.Sequential)]
        struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }

        [StructLayout(LayoutKind.Explicit)]
        struct INPUTUNION
        {
            [FieldOffset(0)] public MOUSEINPUT mi;
            [FieldOffset(0)] public KEYBDINPUT ki;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct INPUT { public uint type; public INPUTUNION u; }

        [DllImport("user32.dll", SetLastError = true)]
        static extern uint SendInput(uint count, INPUT[] inputs, int size);
        [DllImport("user32.dll")]
        static extern uint MapVirtualKey(uint code, uint mapType);
        [DllImport("user32.dll")]
        static extern short GetKeyState(int vk);
        [DllImport("user32.dll")]
        static extern short GetAsyncKeyState(int vk);

        static readonly int Size = Marshal.SizeOf(typeof(INPUT));

        static void Send(INPUT input)
        {
            INPUT[] batch = new INPUT[] { input };
            if (SendInput(1, batch, Size) != 1)
                throw new Exception("blocked by Windows (error " + Marshal.GetLastWin32Error() + ")");
        }

        // Keys that live on the "extended" part of the keyboard. Without the
        // flag, Shift+Arrow and friends are read as numpad keys.
        static bool Extended(int vk)
        {
            return (vk >= 0x21 && vk <= 0x28) || vk == 0x2C || vk == 0x2D || vk == 0x2E
                || vk == 0x5B || vk == 0x5C || vk == 0x5D || vk == 0xA3 || vk == 0xA5
                || (vk >= 0xAD && vk <= 0xB3);
        }

        static void Key(int vk, bool down)
        {
            INPUT i = new INPUT();
            i.type = 1;
            i.u.ki.wVk = (ushort)vk;
            i.u.ki.wScan = (ushort)MapVirtualKey((uint)vk, 0);
            uint flags = 0;
            if (Extended(vk)) flags |= 0x0001;
            if (!down) flags |= 0x0002;
            i.u.ki.dwFlags = flags;
            Send(i);
        }

        static void Mouse(uint flags, int dx, int dy, int data)
        {
            INPUT i = new INPUT();
            i.type = 0;
            i.u.mi.dx = dx;
            i.u.mi.dy = dy;
            i.u.mi.mouseData = data;
            i.u.mi.dwFlags = flags;
            Send(i);
        }

        static readonly uint[] ButtonDown = new uint[] { 0x0002, 0x0008, 0x0020 };
        static readonly uint[] ButtonUp = new uint[] { 0x0004, 0x0010, 0x0040 };

        static int Int(string s) { return int.Parse(s, CultureInfo.InvariantCulture); }

        static void Handle(string[] p)
        {
            switch (p[0])
            {
                case "k":
                    Key(Int(p[1]), p[2] == "1");
                    break;
                case "m":
                    Mouse(0x0001, Int(p[1]), Int(p[2]), 0);
                    break;
                case "b":
                    int b = Int(p[1]);
                    if (b < 0 || b > 2) return;
                    Mouse(p[2] == "1" ? ButtonDown[b] : ButtonUp[b], 0, 0, 0);
                    break;
                case "w":
                    int dy = Int(p[1]);
                    int dx = p.Length > 2 ? Int(p[2]) : 0;
                    if (dy != 0) Mouse(0x0800, 0, 0, dy);
                    if (dx != 0) Mouse(0x1000, 0, 0, dx);
                    break;
                case "q":
                    int vk = Int(p[1]);
                    bool isDown = (GetAsyncKeyState(vk) & 0x8000) != 0;
                    bool toggled = (GetKeyState(vk) & 1) != 0;
                    Console.Out.WriteLine("s " + vk + " " + (isDown ? "1" : "0") + " " + (toggled ? "1" : "0"));
                    break;
            }
        }

        public static void Run()
        {
            Console.Out.WriteLine("ready");
            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                if (line.Length == 0) continue;
                try { Handle(line.Split(' ')); }
                catch (Exception ex) { Console.Out.WriteLine("e " + ex.Message); }
            }
        }
    }
}
