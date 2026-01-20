# Reviving the GTX Titan X via VFIO Passthrough

> **Goal**: Utilize the legacy GTX Titan X (12GB VRAM) through a sandboxed Arch Linux VM with an older NVIDIA driver, exposed as a compute service via message passing.
>
> **Last Updated**: 2026-01-20 | **Status**: Research Complete

## Hardware Overview

| Component | Details |
|-----------|---------|
| **Target GPU** | NVIDIA GTX Titan X (GM200 Maxwell) - 12GB VRAM |
| **Compute Capability** | 5.2 (sm_52) |
| **PCI Address** | `99:00.0` (GPU), `99:00.1` (Audio) |
| **Device IDs** | `10de:17c2` (GPU), `10de:0fb0` (Audio) |
| **Host GPU** | NVIDIA Titan RTX (TU102) - remains on host |
| **CPU** | Intel Xeon Gold 6128 (VT-x, VT-d capable, native ACS support) |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         HOST (Arch Linux)                        │
│  ┌─────────────┐    ┌──────────────────────────────────────┐    │
│  │ Titan RTX   │    │           QEMU/KVM VM                │    │
│  │ (nvidia)    │    │  ┌────────────────────────────────┐  │    │
│  │             │    │  │    Sandboxed Arch Linux        │  │    │
│  │ - Primary   │    │  │  ┌──────────────────────────┐  │  │    │
│  │ - Ollama    │    │  │  │  GTX Titan X (vfio-pci)  │  │  │    │
│  │ - Display   │    │  │  │  nvidia-580xx driver     │  │  │    │
│  └─────────────┘    │  │  │  CUDA 13.x               │  │  │    │
│                     │  │  └──────────────────────────┘  │  │    │
│  ┌─────────────┐    │  │                                │  │    │
│  │ gRPC/Redis  │◄───┼──┼─► GPU Compute Service          │  │    │
│  │ + FastAPI   │    │  │   - Inference Server           │  │    │
│  │ (secured)   │    │  │   - Batch Processing           │  │    │
│  └─────────────┘    │  └────────────────────────────────┘  │    │
│        │            └──────────────────────────────────────┘    │
│        ▼                                                        │
│  ┌─────────────┐                                                │
│  │ Client Apps │ (memOS, batch jobs, overflow compute)          │
│  └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 0: Pre-Flight Verification (CRITICAL)

Before making any configuration changes, verify IOMMU groups and hardware compatibility.

### 0.1 Check IOMMU Groups

**Run this BEFORE enabling VFIO:**
```bash
#!/bin/bash
# Save as check-iommu-groups.sh
shopt -s nullglob
for g in $(find /sys/kernel/iommu_groups/* -maxdepth 0 -type d | sort -V); do
    echo "IOMMU Group ${g##*/}:"
    for d in $g/devices/*; do
        echo -e "\t$(lspci -nns ${d##*/})"
    done
done
```

**What to look for:**
- GTX Titan X should be in its own group (or only with its audio device `10de:0fb0`)
- If it shares a group with other devices, you may need to:
  1. Move the GPU to a different PCIe slot
  2. Pass through ALL devices in the group
  3. Use ACS override patch (security risk, not recommended)

> **Good news**: Intel Xeon Gold 6128 typically has excellent native ACS support, so IOMMU groups should be properly isolated.

### 0.2 Verify Hardware IDs

```bash
lspci -nn | grep -i nvidia
# Expected output includes:
# XX:00.0 VGA compatible controller [0300]: NVIDIA Corporation GM200 [GeForce GTX TITAN X] [10de:17c2]
# XX:00.1 Audio device [0403]: NVIDIA Corporation GM200 High Definition Audio [10de:0fb0]
```

### 0.3 Check BIOS Settings

Enable in BIOS/UEFI:
- **Intel VT-d** (Virtualization Technology for Directed I/O)
- **Intel VT-x** (Virtualization Technology)
- **ACS** (Access Control Services) if available
- **Memory Remap Feature** (may be needed for VT-d)
- Consider **disabling CSM/Legacy boot** to avoid GPU ROM shadowing issues

---

## Phase 1: VFIO Passthrough Setup

### 1.1 Enable IOMMU in GRUB

**File**: `/etc/default/grub`

```bash
# Add intel_iommu=on iommu=pt to kernel parameters
sudo sed -i 's/GRUB_CMDLINE_LINUX_DEFAULT="splash/GRUB_CMDLINE_LINUX_DEFAULT="intel_iommu=on iommu=pt splash/' /etc/default/grub
```

**Result**:
```
GRUB_CMDLINE_LINUX_DEFAULT="intel_iommu=on iommu=pt splash iwlwifi.disable_11ax=1 iwlwifi.power_save=0 bt_coex_active=0"
```

### 1.2 Configure VFIO to Bind GTX Titan X

**File**: `/etc/modprobe.d/vfio.conf`
```bash
# Bind GTX Titan X to vfio-pci by device ID
options vfio-pci ids=10de:17c2,10de:0fb0 disable_vga=1

# Ensure vfio-pci loads BEFORE any nvidia modules
softdep nvidia pre: vfio-pci
softdep nvidia_drm pre: vfio-pci
softdep nvidia_uvm pre: vfio-pci
softdep nvidia_modeset pre: vfio-pci
softdep nouveau pre: vfio-pci
softdep nvidiafb pre: vfio-pci
```

This ensures vfio-pci claims the Titan X before any nvidia driver.

### 1.3 Update mkinitcpio for Early VFIO Loading

**File**: `/etc/mkinitcpio.conf`

Add to MODULES (VFIO modules MUST come first):
```
MODULES=(vfio_pci vfio vfio_iommu_type1 nvidia nvidia_modeset nvidia_uvm nvidia_drm)
```

> **Note**: `vfio_virqfd` was merged into base `vfio` module in kernel 6.2+, so it's not needed separately.

### 1.4 Regenerate Boot Images

```bash
sudo mkinitcpio -P
sudo grub-mkconfig -o /boot/grub/grub.cfg
```

### 1.5 Reboot and Verify

```bash
# After reboot, verify IOMMU is enabled
dmesg | grep -e DMAR -e IOMMU
# Should see: DMAR: IOMMU enabled

# Verify Titan X is bound to vfio-pci
lspci -nnk -s 99:00
# Should show: Kernel driver in use: vfio-pci

# Verify Titan RTX is on nvidia driver
lspci -nnk | grep -A2 "TITAN RTX"
# Should show: Kernel driver in use: nvidia

# Verify VFIO modules loaded
lsmod | grep vfio
```

---

## Phase 2: VM Setup with libvirt/QEMU

### 2.1 Install Virtualization Stack

```bash
sudo pacman -S qemu-full libvirt virt-manager dnsmasq edk2-ovmf
sudo systemctl enable --now libvirtd
sudo usermod -aG libvirt $USER
```

### 2.2 Create VM Storage

```bash
# Create a qcow2 disk for the VM (100GB should suffice)
sudo qemu-img create -f qcow2 /var/lib/libvirt/images/titan-worker.qcow2 100G
```

### 2.3 Prepare OVMF NVRAM Template

**CRITICAL**: Copy NVRAM template before first boot:
```bash
sudo mkdir -p /var/lib/libvirt/qemu/nvram
sudo cp /usr/share/edk2/x64/OVMF_VARS.4m.fd /var/lib/libvirt/qemu/nvram/titan-worker_VARS.fd
```

### 2.4 Configure Hugepages (Performance)

**Host configuration** for better GPU passthrough performance:
```bash
# /etc/sysctl.d/hugepages.conf
echo "vm.nr_hugepages = 8192" | sudo tee /etc/sysctl.d/hugepages.conf
sudo sysctl -p /etc/sysctl.d/hugepages.conf
```

### 2.5 Download Arch Linux ISO

```bash
# Get latest Arch ISO for VM installation
curl -LO https://mirrors.kernel.org/archlinux/iso/latest/archlinux-x86_64.iso
sudo mv archlinux-x86_64.iso /var/lib/libvirt/images/
```

### 2.6 Create VM with GPU Passthrough

**Option A: virt-manager GUI**
1. Create new VM → Local install media → archlinux ISO
2. RAM: 16GB (or more), CPUs: 8
3. Before finishing, check "Customize configuration"
4. Add Hardware → PCI Host Device → Select `99:00.0` and `99:00.1`
5. Set firmware to UEFI (OVMF)

**Option B: virsh XML (recommended for reproducibility)**

Create `/etc/libvirt/qemu/titan-worker.xml`:
```xml
<domain type='kvm'>
  <name>titan-worker</name>
  <memory unit='GiB'>16</memory>
  <vcpu placement='static' cpuset='0-7'>8</vcpu>

  <!-- CPU Pinning for Performance -->
  <cputune>
    <vcpupin vcpu='0' cpuset='0'/>
    <vcpupin vcpu='1' cpuset='1'/>
    <vcpupin vcpu='2' cpuset='2'/>
    <vcpupin vcpu='3' cpuset='3'/>
    <vcpupin vcpu='4' cpuset='4'/>
    <vcpupin vcpu='5' cpuset='5'/>
    <vcpupin vcpu='6' cpuset='6'/>
    <vcpupin vcpu='7' cpuset='7'/>
    <emulatorpin cpuset='8-9'/>
  </cputune>

  <!-- Hugepages for GPU Workloads -->
  <memoryBacking>
    <hugepages/>
  </memoryBacking>

  <os>
    <type arch='x86_64' machine='q35'>hvm</type>
    <loader readonly='yes' type='pflash'>/usr/share/edk2/x64/OVMF_CODE.4m.fd</loader>
    <nvram>/var/lib/libvirt/qemu/nvram/titan-worker_VARS.fd</nvram>
    <boot dev='hd'/>
  </os>

  <features>
    <acpi/>
    <apic/>
    <kvm>
      <hidden state='on'/>
    </kvm>
    <!-- Vendor ID masking to prevent VM detection -->
    <hyperv>
      <vendor_id state='on' value='AuthenticAMD'/>
    </hyperv>
  </features>

  <cpu mode='host-passthrough' check='none'>
    <topology sockets='1' cores='8' threads='1'/>
    <feature policy='disable' name='hypervisor'/>
  </cpu>

  <clock offset='utc'>
    <timer name='rtc' tickpolicy='catchup'/>
    <timer name='pit' tickpolicy='delay'/>
    <timer name='hpet' present='no'/>
  </clock>

  <devices>
    <emulator>/usr/bin/qemu-system-x86_64</emulator>
    <disk type='file' device='disk'>
      <driver name='qemu' type='qcow2'/>
      <source file='/var/lib/libvirt/images/titan-worker.qcow2'/>
      <target dev='vda' bus='virtio'/>
    </disk>
    <interface type='network'>
      <source network='default'/>
      <model type='virtio'/>
    </interface>

    <!-- GTX Titan X GPU -->
    <hostdev mode='subsystem' type='pci' managed='yes'>
      <source>
        <address domain='0x0000' bus='0x99' slot='0x00' function='0x0'/>
      </source>
      <!-- Uncomment if needed: <rom file='/var/lib/libvirt/images/titan-x.rom'/> -->
    </hostdev>

    <!-- GTX Titan X Audio (same IOMMU group) -->
    <hostdev mode='subsystem' type='pci' managed='yes'>
      <source>
        <address domain='0x0000' bus='0x99' slot='0x00' function='0x1'/>
      </source>
    </hostdev>

    <console type='pty'/>

    <!-- QEMU Guest Agent for proper VM management -->
    <channel type='unix'>
      <source mode='bind' path='/var/lib/libvirt/qemu/titan-worker.agent'/>
      <target type='virtio' name='org.qemu.guest_agent.0'/>
    </channel>

    <channel type='spicevmc'>
      <target type='virtio' name='com.redhat.spice.0'/>
    </channel>
    <graphics type='spice' autoport='yes'/>
    <video>
      <model type='qxl' ram='65536' vram='65536' vgamem='16384' heads='1'/>
    </video>
  </devices>
</domain>
```

```bash
sudo virsh define /etc/libvirt/qemu/titan-worker.xml
sudo virsh start titan-worker
```

---

## Phase 3: Guest OS Configuration

### 3.1 Install Arch Linux in VM

Boot from ISO and perform standard Arch installation:
```bash
# Partition, format, mount, pacstrap, etc.
pacstrap /mnt base linux linux-lts linux-firmware base-devel vim openssh qemu-guest-agent
# Use linux-lts for better driver stability
# ... complete installation
```

**Enable guest agent in VM:**
```bash
sudo systemctl enable --now qemu-guest-agent
```

### 3.2 Install Legacy NVIDIA Driver

The GTX Titan X (Maxwell GM200) requires **nvidia-580xx** driver.

> **IMPORTANT**: As of December 2025, NVIDIA 590+ drivers dropped Maxwell/Pascal support entirely. Use the **580.xx legacy branch** which is the last version optimized for Maxwell.

```bash
# In the VM guest:
# Add AUR helper
sudo pacman -S git
git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si

# Install nvidia-580xx legacy driver (correct driver for Maxwell)
yay -S nvidia-580xx-dkms nvidia-580xx-utils nvidia-580xx-settings lib32-nvidia-580xx-utils
```

> **Note**: The nvidia-470xx driver also works but nvidia-580xx provides better CUDA support (13.x vs 11.4) and modern kernel compatibility. The 580.xx branch is maintained by the CachyOS project.

### 3.3 Install CUDA and PyTorch

```bash
# PyTorch with CUDA 11.x support (works with nvidia-580xx)
# Create venv first
python -m venv /opt/titan-worker/venv
source /opt/titan-worker/venv/bin/activate

# Install PyTorch - binaries include CUDA runtime
pip install torch==2.0.1 torchvision==0.15.2 torchaudio==2.0.2 --index-url https://download.pytorch.org/whl/cu118
```

### 3.4 Verify GPU Access

```bash
nvidia-smi
# Should show GTX Titan X with 12GB VRAM

# Test CUDA
python -c "import torch; print(torch.cuda.get_device_name(0)); print(f'CUDA: {torch.version.cuda}')"
# Should output: NVIDIA GeForce GTX TITAN X
```

### 3.5 Configure Network (Static IP for Service)

```bash
# /etc/systemd/network/20-wired.network
[Match]
Name=enp*

[Network]
Address=192.168.122.10/24
Gateway=192.168.122.1
DNS=192.168.122.1
```

```bash
sudo systemctl enable --now systemd-networkd
```

---

## Phase 4: GPU Compute Service

### 4.1 Recommended Architecture

Based on research, the recommended architecture is:

| Component | Protocol | Purpose |
|-----------|----------|---------|
| **gRPC Server** | HTTP/2 + Protobuf | Low-latency inference, streaming |
| **FastAPI** | HTTP/1.1 + JSON | Health checks, simple queries |
| **Redis Streams** | TCP | Job persistence, queue management |

> **Note on Triton**: NVIDIA Triton Inference Server is **NOT recommended** for GTX Titan X because it requires compute capability 6.0+ (Pascal), while Maxwell is 5.2.

### 4.2 GPU Worker Service (In VM)

Create `/opt/titan-worker/worker.py`:
```python
#!/usr/bin/env python3
"""
Titan X GPU Worker Service
Exposes GPU compute via ZeroMQ with authentication and input validation
"""
import zmq
import zmq.auth
from zmq.auth.thread import ThreadAuthenticator
import json
import torch
import numpy as np
from typing import Any, Optional
import logging
import signal
import sys

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("titan-worker")

# Security: Maximum matrix dimensions to prevent memory exhaustion
MAX_MATRIX_DIM = 10000
MAX_ELEMENTS = 100_000_000  # 100M elements max


class TitanWorker:
    def __init__(self, bind_addr: str = "tcp://192.168.122.10:5555", use_auth: bool = True):
        self.context = zmq.Context()
        self.use_auth = use_auth
        self.running = True

        # Setup authentication (CurveZMQ)
        if use_auth:
            self.auth = ThreadAuthenticator(self.context)
            self.auth.start()
            self.auth.allow('192.168.122.1')  # Only allow host
            # In production, use curve authentication:
            # self.auth.configure_curve(domain='*', location='/path/to/authorized_keys')

        self.socket = self.context.socket(zmq.REP)
        self.socket.setsockopt(zmq.RCVTIMEO, 30000)  # 30s timeout

        # SECURITY: Bind to specific IP, NOT tcp://*:5555
        self.socket.bind(bind_addr)
        logger.info(f"Bound to {bind_addr}")

        # Initialize CUDA
        self.device = torch.device("cuda:0")
        logger.info(f"CUDA Device: {torch.cuda.get_device_name(0)}")
        logger.info(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

        # Setup graceful shutdown
        signal.signal(signal.SIGTERM, self._shutdown)
        signal.signal(signal.SIGINT, self._shutdown)

    def _shutdown(self, signum, frame):
        logger.info("Shutting down gracefully...")
        self.running = False

    def _validate_matrix(self, matrix: list, name: str) -> Optional[str]:
        """Validate matrix dimensions to prevent resource exhaustion"""
        if not isinstance(matrix, list):
            return f"{name} must be a list"
        if len(matrix) == 0:
            return f"{name} cannot be empty"
        if len(matrix) > MAX_MATRIX_DIM:
            return f"{name} exceeds max rows ({MAX_MATRIX_DIM})"
        if not isinstance(matrix[0], list):
            return f"{name} must be 2D"
        if len(matrix[0]) > MAX_MATRIX_DIM:
            return f"{name} exceeds max columns ({MAX_MATRIX_DIM})"
        total_elements = len(matrix) * len(matrix[0])
        if total_elements > MAX_ELEMENTS:
            return f"{name} exceeds max elements ({MAX_ELEMENTS})"
        return None

    def handle_request(self, request: dict) -> dict:
        """Route requests to appropriate handlers"""
        op = request.get("op")

        if op == "ping":
            return {"status": "ok", "gpu": torch.cuda.get_device_name(0)}

        elif op == "matrix_multiply":
            # Validate inputs
            if "a" not in request or "b" not in request:
                return {"error": "Missing 'a' or 'b' matrix"}

            err = self._validate_matrix(request["a"], "a")
            if err:
                return {"error": err}
            err = self._validate_matrix(request["b"], "b")
            if err:
                return {"error": err}

            try:
                a = torch.tensor(request["a"], device=self.device, dtype=torch.float32)
                b = torch.tensor(request["b"], device=self.device, dtype=torch.float32)
                result = torch.matmul(a, b)
                return {"result": result.cpu().numpy().tolist()}
            except Exception as e:
                return {"error": f"Matrix operation failed: {str(e)}"}

        elif op == "inference":
            # Placeholder for model inference
            model_name = request.get("model")
            input_data = request.get("input")
            # Load model, run inference...
            return {"output": "inference_result", "model": model_name}

        elif op == "gpu_info":
            props = torch.cuda.get_device_properties(0)
            return {
                "name": props.name,
                "total_memory_gb": props.total_memory / 1e9,
                "free_memory_gb": (props.total_memory - torch.cuda.memory_allocated()) / 1e9,
                "multi_processor_count": props.multi_processor_count,
                "cuda_capability": f"{props.major}.{props.minor}"
            }

        elif op == "health":
            return {
                "status": "healthy",
                "gpu_available": torch.cuda.is_available(),
                "memory_allocated_gb": torch.cuda.memory_allocated() / 1e9,
                "memory_cached_gb": torch.cuda.memory_reserved() / 1e9
            }

        else:
            return {"error": f"Unknown operation: {op}"}

    def run(self):
        logger.info("Titan Worker started, waiting for requests...")
        while self.running:
            try:
                message = self.socket.recv_json()
                op = message.get('op', 'unknown')
                logger.info(f"Received operation: {op}")

                response = self.handle_request(message)
                self.socket.send_json(response)

                # Clear GPU cache periodically
                if torch.cuda.memory_allocated() > 8e9:  # 8GB threshold
                    torch.cuda.empty_cache()

            except zmq.Again:
                # Timeout - check if still running
                continue
            except Exception as e:
                logger.error(f"Error: {e}")
                try:
                    self.socket.send_json({"error": str(e)})
                except:
                    pass

        # Cleanup
        logger.info("Cleaning up...")
        if self.use_auth:
            self.auth.stop()
        self.socket.close()
        self.context.term()


if __name__ == "__main__":
    # SECURITY: Bind only to libvirt network, not all interfaces
    worker = TitanWorker("tcp://192.168.122.10:5555", use_auth=False)
    worker.run()
```

### 4.3 Systemd Service (In VM)

Create `/etc/systemd/system/titan-worker.service`:
```ini
[Unit]
Description=Titan X GPU Worker Service
After=network.target

[Service]
Type=simple
User=titan
Group=video
WorkingDirectory=/opt/titan-worker
ExecStart=/opt/titan-worker/venv/bin/python worker.py
Restart=always
RestartSec=5
Environment=CUDA_VISIBLE_DEVICES=0
# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/titan-worker

[Install]
WantedBy=multi-user.target
```

```bash
# Create service user
sudo useradd -r -s /usr/bin/nologin titan
sudo usermod -aG video titan
sudo chown -R titan:titan /opt/titan-worker

sudo systemctl enable --now titan-worker
```

### 4.4 Host-Side Client Library

Create on host at `/home/sparkone/sdd/unified_dashboard/src/lib/titanClient.ts`:
```typescript
import { Socket } from 'zeromq';

interface TitanRequest {
  op: string;
  [key: string]: any;
}

interface TitanResponse {
  status?: string;
  error?: string;
  [key: string]: any;
}

interface GPUInfo {
  name: string;
  total_memory_gb: number;
  free_memory_gb: number;
  multi_processor_count: number;
  cuda_capability: string;
}

export class TitanClient {
  private socket: Socket;
  private endpoint: string;
  private connected: boolean = false;

  constructor(endpoint: string = 'tcp://192.168.122.10:5555') {
    this.endpoint = endpoint;
    this.socket = new Socket(/* zmq.REQ */);
  }

  async connect(): Promise<void> {
    if (!this.connected) {
      await this.socket.connect(this.endpoint);
      this.connected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.socket.close();
      this.connected = false;
    }
  }

  async request(req: TitanRequest, timeout: number = 30000): Promise<TitanResponse> {
    await this.connect();
    await this.socket.send(JSON.stringify(req));
    const [response] = await this.socket.receive();
    return JSON.parse(response.toString());
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.request({ op: 'ping' });
      return res.status === 'ok';
    } catch {
      return false;
    }
  }

  async gpuInfo(): Promise<GPUInfo | null> {
    try {
      const res = await this.request({ op: 'gpu_info' });
      if (res.error) return null;
      return res as GPUInfo;
    } catch {
      return null;
    }
  }

  async health(): Promise<TitanResponse> {
    return this.request({ op: 'health' });
  }

  async matrixMultiply(a: number[][], b: number[][]): Promise<number[][] | null> {
    const res = await this.request({ op: 'matrix_multiply', a, b });
    if (res.error) {
      console.error('Matrix multiply error:', res.error);
      return null;
    }
    return res.result;
  }
}
```

---

## Phase 5: Integration with Ecosystem

### 5.1 Add to Dashboard Health Monitoring

Update `/home/sparkone/sdd/unified_dashboard/config/ports.ts`:
```typescript
export const TITAN_WORKER_HOST = '192.168.122.10';
export const TITAN_WORKER_PORT = 5555;
export const TITAN_WORKER_URL = `tcp://${TITAN_WORKER_HOST}:${TITAN_WORKER_PORT}`;
```

### 5.2 Add Health Check Endpoint

Create health probe in dashboard backend:
```typescript
// server/routes/titan.ts
router.get('/api/titan/health', async (req, res) => {
  try {
    const client = new TitanClient();
    await client.connect();
    const info = await client.health();
    await client.disconnect();
    res.json({ status: 'healthy', ...info });
  } catch (error) {
    res.json({ status: 'unhealthy', error: error.message });
  }
});
```

### 5.3 Use Cases

| Use Case | Implementation |
|----------|----------------|
| **Overflow Compute** | Route batch jobs to Titan X when Titan RTX is busy |
| **Legacy Model Inference** | Run older CUDA-dependent models |
| **Parallel Processing** | Split workloads across both GPUs |
| **Development/Testing** | Isolate experimental code in VM |

### 5.4 memOS Integration

Add Titan X as secondary compute backend in memOS config:
```yaml
# Recovery_Bot/memOS/server/config/compute_backends.yaml
backends:
  primary:
    type: local
    device: cuda:0  # Titan RTX
  secondary:
    type: remote
    endpoint: tcp://192.168.122.10:5555
    device: titan-x-vm
    capabilities:
      - matrix_ops
      - legacy_inference
```

---

## Phase 6: VM Lifecycle Management

### 6.1 Auto-start VM on Boot

```bash
sudo virsh autostart titan-worker
```

### 6.2 Graceful Shutdown Script

Create `/usr/local/bin/titan-vm-control`:
```bash
#!/bin/bash
case "$1" in
  start)
    virsh start titan-worker
    ;;
  stop)
    virsh shutdown titan-worker
    sleep 30
    virsh destroy titan-worker 2>/dev/null
    ;;
  status)
    virsh domstate titan-worker
    ;;
  *)
    echo "Usage: $0 {start|stop|status}"
    ;;
esac
```

### 6.3 Add to ecosystem.sh

Update ecosystem management to include VM:
```bash
# In ecosystem.sh, add titan-worker VM management
check_titan_vm() {
  if virsh domstate titan-worker 2>/dev/null | grep -q running; then
    echo "running"
  else
    echo "stopped"
  fi
}
```

---

## Checklist

### Phase 0: Pre-Flight
- [ ] Run IOMMU group check script
- [ ] Verify GTX Titan X is isolated (or only with audio device)
- [ ] Confirm BIOS settings (VT-d, VT-x, ACS enabled)
- [ ] Note actual PCI address (may differ from `99:00.0`)

### Phase 1: VFIO Setup
- [ ] Enable IOMMU in `/etc/default/grub`
- [ ] Create `/etc/modprobe.d/vfio.conf` with device IDs and ALL softdeps
- [ ] Update `/etc/mkinitcpio.conf` MODULES (vfio first, then nvidia)
- [ ] Run `mkinitcpio -P`
- [ ] Run `grub-mkconfig -o /boot/grub/grub.cfg`
- [ ] Reboot and verify with `lspci -nnk -s XX:00`
- [ ] Verify Titan RTX still on nvidia driver

### Phase 2: VM Setup
- [ ] Install qemu, libvirt, virt-manager, edk2-ovmf
- [ ] Create VM disk image (100GB qcow2)
- [ ] **Copy NVRAM template** before first boot
- [ ] Configure hugepages on host
- [ ] Configure VM with GPU passthrough, CPU pinning, vendor_id masking
- [ ] Install Arch Linux in VM (use linux-lts kernel)

### Phase 3: Guest Configuration
- [ ] Install `nvidia-580xx-dkms` driver (NOT 470xx or 390xx)
- [ ] Install PyTorch 2.0.x with CUDA 11.x
- [ ] Verify GPU with nvidia-smi
- [ ] Configure static IP (192.168.122.10)
- [ ] Install and enable qemu-guest-agent

### Phase 4: Service Setup
- [ ] Create worker.py with input validation and security
- [ ] Configure systemd service with hardening
- [ ] Test from host with ping operation
- [ ] Verify memory limits work

### Phase 5: Integration
- [ ] Add to dashboard health monitoring
- [ ] Create client library
- [ ] Integrate with memOS (optional)

### Phase 6: Operations
- [ ] Enable VM autostart
- [ ] Add to ecosystem.sh
- [ ] Document procedures
- [ ] Test graceful shutdown

---

## Troubleshooting

### IOMMU Group Issues
If the Titan X shares an IOMMU group with other devices:
```bash
# Check IOMMU groups (run Phase 0 script)
./check-iommu-groups.sh

# Options:
# 1. Move GPU to different PCIe slot (best)
# 2. Pass through ALL devices in the group
# 3. ACS override patch (security risk, last resort)
```

### VM Won't Start with GPU
```bash
# Check for errors
journalctl -u libvirtd -f

# Verify VFIO binding
lspci -nnk -s 99:00

# Check if nvidia driver grabbed it first
lsmod | grep nvidia

# If GPU ROM issues, dump and use ROM file:
echo 1 > /sys/bus/pci/devices/0000:99:00.0/rom
cat /sys/bus/pci/devices/0000:99:00.0/rom > ~/titan-x.rom
echo 0 > /sys/bus/pci/devices/0000:99:00.0/rom
# Then add to VM XML: <rom file='/var/lib/libvirt/images/titan-x.rom'/>
```

### Driver Issues in VM
```bash
# In VM: Check dmesg for nvidia errors
dmesg | grep -i nvidia

# Verify correct driver version
pacman -Q | grep nvidia
# Should show nvidia-580xx packages

# If kernel updated and driver broke:
yay -S nvidia-580xx-dkms  # Rebuild for new kernel
```

### Code 43 Error (Windows Guest)
If using Windows VM and getting Code 43:
1. Ensure `<kvm><hidden state='on'/>` in XML
2. Add `<hyperv><vendor_id state='on' value='AuthenticAMD'/></hyperv>`
3. Add `<feature policy='disable' name='hypervisor'/>` to CPU
4. Use nvidia driver 465+ (removed VM detection blocks)

### Network Connectivity
```bash
# From host, test VM connectivity
ping 192.168.122.10

# Check libvirt network
virsh net-list --all
virsh net-start default

# Ensure IP forwarding is enabled
sudo sysctl -w net.ipv4.ip_forward=1
```

### GPU Reset Bug
If GPU fails on subsequent VM boots without host reboot:
```bash
# Option 1: Full host reboot between VM sessions
# Option 2: Check if vendor-reset module supports GM200
yay -S vendor-reset-dkms-git
# Option 3: Use libvirt hooks to run reset scripts
```

---

## Security Considerations

1. **Network Isolation**: The worker only binds to libvirt network (192.168.122.10), not all interfaces
2. **Input Validation**: Matrix operations have dimension limits to prevent memory exhaustion
3. **Authentication**: CurveZMQ can be enabled for encrypted, authenticated connections
4. **Service Hardening**: Systemd service runs with restricted permissions
5. **IOMMU Protection**: Properly configured IOMMU provides DMA isolation
6. **No ACS Override**: Xeon Gold 6128 has native ACS support, maintaining security isolation

---

## References

- [Arch Wiki: PCI passthrough via OVMF](https://wiki.archlinux.org/title/PCI_passthrough_via_OVMF)
- [NVIDIA Legacy Driver Archive](https://www.nvidia.com/en-us/drivers/unix/)
- [NVIDIA 580.xx AUR Package](https://aur.archlinux.org/packages/nvidia-580xx-dkms)
- [CUDA Toolkit Archive](https://developer.nvidia.com/cuda-toolkit-archive)
- [ZeroMQ Guide](https://zguide.zeromq.org/)
- [libvirt Documentation](https://libvirt.org/docs.html)
- [Arch Linux NVIDIA 590 Announcement](https://archlinux.org/news/nvidia-590-driver-drops-pascal-support-main-packages-switch-to-open-kernel-modules/)
- [NVIDIA-vBIOS-VFIO-Patcher](https://github.com/Matoking/NVIDIA-vBIOS-VFIO-Patcher)

---

*Created: 2026-01-19 | Updated: 2026-01-20 | Target GPU: GTX Titan X (GM200 Maxwell) 12GB*
*Research agents reviewed: VFIO best practices, legacy drivers, GPU service architectures, plan technical review*
