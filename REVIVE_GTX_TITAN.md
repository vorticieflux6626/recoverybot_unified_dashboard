# Reviving the GTX Titan X via VFIO Passthrough

> **Goal**: Utilize the legacy GTX Titan X (12GB VRAM) through a sandboxed Arch Linux VM with an older NVIDIA driver, exposed as a compute service via message passing.

## Hardware Overview

| Component | Details |
|-----------|---------|
| **Target GPU** | NVIDIA GTX Titan X (GM200) - 12GB VRAM |
| **PCI Address** | `99:00.0` (GPU), `99:00.1` (Audio) |
| **Device IDs** | `10de:17c2` (GPU), `10de:0fb0` (Audio) |
| **Host GPU** | NVIDIA Titan RTX (TU102) - remains on host |
| **CPU** | Intel Xeon Gold 6128 (VT-x, VT-d capable) |

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
│  │ - Display   │    │  │  │  nvidia-470xx driver     │  │  │    │
│  └─────────────┘    │  │  │  CUDA 11.4               │  │  │    │
│                     │  │  └──────────────────────────┘  │  │    │
│  ┌─────────────┐    │  │                                │  │    │
│  │ Message Bus │◄───┼──┼─► GPU Compute Service          │  │    │
│  │ (ZeroMQ/    │    │  │   - Inference Server           │  │    │
│  │  Redis/gRPC)│    │  │   - Batch Processing           │  │    │
│  └─────────────┘    │  └────────────────────────────────┘  │    │
│        │            └──────────────────────────────────────┘    │
│        ▼                                                        │
│  ┌─────────────┐                                                │
│  │ Client Apps │ (memOS, batch jobs, overflow compute)          │
│  └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
```

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
options vfio-pci ids=10de:17c2,10de:0fb0
softdep nvidia pre: vfio-pci
```

This ensures vfio-pci claims the Titan X before the nvidia driver.

### 1.3 Update mkinitcpio for Early VFIO Loading

**File**: `/etc/mkinitcpio.conf`

Add to MODULES (before any nvidia modules):
```
MODULES=(vfio_pci vfio vfio_iommu_type1 ...)
```

### 1.4 Regenerate Boot Images

```bash
sudo mkinitcpio -P
sudo grub-mkconfig -o /boot/grub/grub.cfg
```

### 1.5 Reboot and Verify

```bash
# After reboot, verify IOMMU is enabled
dmesg | grep -i iommu

# Verify Titan X is bound to vfio-pci
lspci -nnk -s 99:00
# Should show: Kernel driver in use: vfio-pci

# Check IOMMU groups
for d in /sys/kernel/iommu_groups/*/devices/*; do
  n=$(basename $d)
  g=$(echo $d | cut -d/ -f5)
  echo "IOMMU $g: $(lspci -nns $n)"
done | grep -i nvidia
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

### 2.3 Download Arch Linux ISO

```bash
# Get latest Arch ISO for VM installation
curl -LO https://mirrors.kernel.org/archlinux/iso/latest/archlinux-x86_64.iso
sudo mv archlinux-x86_64.iso /var/lib/libvirt/images/
```

### 2.4 Create VM with GPU Passthrough

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
  <vcpu placement='static'>8</vcpu>
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
  </features>
  <cpu mode='host-passthrough' check='none'>
    <topology sockets='1' cores='8' threads='1'/>
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
    </hostdev>
    <!-- GTX Titan X Audio (same IOMMU group) -->
    <hostdev mode='subsystem' type='pci' managed='yes'>
      <source>
        <address domain='0x0000' bus='0x99' slot='0x00' function='0x1'/>
      </source>
    </hostdev>
    <console type='pty'/>
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
pacstrap /mnt base linux linux-firmware base-devel vim openssh
# ... complete installation
```

### 3.2 Install Legacy NVIDIA Driver

The GTX Titan X (Maxwell GM200) requires **nvidia-470xx** or earlier.

```bash
# In the VM guest:
# Add AUR helper
sudo pacman -S git
git clone https://aur.archlinux.org/yay.git && cd yay && makepkg -si

# Install legacy driver (470.xx series supports Maxwell)
yay -S nvidia-470xx-dkms nvidia-470xx-utils lib32-nvidia-470xx-utils

# Or if 470 doesn't work, try 390xx series
# yay -S nvidia-390xx-dkms nvidia-390xx-utils
```

### 3.3 Install CUDA Toolkit (Compatible Version)

```bash
# CUDA 11.4 is the last version supporting 470.xx driver
yay -S cuda-11.4
# Or download directly from NVIDIA archive
```

### 3.4 Verify GPU Access

```bash
nvidia-smi
# Should show GTX Titan X with 12GB VRAM

# Test CUDA
cat > test.cu << 'EOF'
#include <stdio.h>
__global__ void hello() { printf("Hello from CUDA!\n"); }
int main() { hello<<<1,1>>>(); cudaDeviceSynchronize(); return 0; }
EOF
nvcc test.cu -o test && ./test
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

### 4.1 Service Architecture Options

| Option | Pros | Cons | Best For |
|--------|------|------|----------|
| **ZeroMQ** | Fast, simple, language-agnostic | No persistence | Real-time inference |
| **Redis Streams** | Persistence, pub/sub | Extra dependency | Job queues |
| **gRPC** | Type-safe, streaming | More complex | Structured APIs |
| **HTTP/REST** | Universal, simple | Higher latency | General purpose |

**Recommendation**: ZeroMQ for low-latency compute requests, Redis for job persistence.

### 4.2 GPU Worker Service (In VM)

Create `/opt/titan-worker/worker.py`:
```python
#!/usr/bin/env python3
"""
Titan X GPU Worker Service
Exposes GPU compute via ZeroMQ REQ/REP pattern
"""
import zmq
import json
import torch
import numpy as np
from typing import Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("titan-worker")

class TitanWorker:
    def __init__(self, bind_addr: str = "tcp://*:5555"):
        self.context = zmq.Context()
        self.socket = self.context.socket(zmq.REP)
        self.socket.bind(bind_addr)

        # Initialize CUDA
        self.device = torch.device("cuda:0")
        logger.info(f"CUDA Device: {torch.cuda.get_device_name(0)}")
        logger.info(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")

    def handle_request(self, request: dict) -> dict:
        """Route requests to appropriate handlers"""
        op = request.get("op")

        if op == "ping":
            return {"status": "ok", "gpu": torch.cuda.get_device_name(0)}

        elif op == "matrix_multiply":
            a = torch.tensor(request["a"], device=self.device, dtype=torch.float32)
            b = torch.tensor(request["b"], device=self.device, dtype=torch.float32)
            result = torch.matmul(a, b)
            return {"result": result.cpu().numpy().tolist()}

        elif op == "inference":
            # Placeholder for model inference
            model_name = request.get("model")
            input_data = request.get("input")
            # Load model, run inference...
            return {"output": "inference_result"}

        elif op == "gpu_info":
            props = torch.cuda.get_device_properties(0)
            return {
                "name": props.name,
                "total_memory_gb": props.total_memory / 1e9,
                "multi_processor_count": props.multi_processor_count,
                "cuda_capability": f"{props.major}.{props.minor}"
            }

        else:
            return {"error": f"Unknown operation: {op}"}

    def run(self):
        logger.info("Titan Worker started, waiting for requests...")
        while True:
            try:
                message = self.socket.recv_json()
                logger.info(f"Received: {message.get('op', 'unknown')}")
                response = self.handle_request(message)
                self.socket.send_json(response)
            except Exception as e:
                logger.error(f"Error: {e}")
                self.socket.send_json({"error": str(e)})

if __name__ == "__main__":
    worker = TitanWorker("tcp://*:5555")
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
WorkingDirectory=/opt/titan-worker
ExecStart=/opt/titan-worker/venv/bin/python worker.py
Restart=always
RestartSec=5
Environment=CUDA_VISIBLE_DEVICES=0

[Install]
WantedBy=multi-user.target
```

```bash
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

export class TitanClient {
  private socket: Socket;
  private endpoint: string;

  constructor(endpoint: string = 'tcp://192.168.122.10:5555') {
    this.endpoint = endpoint;
    this.socket = new Socket(/* zmq.REQ */);
  }

  async connect(): Promise<void> {
    await this.socket.connect(this.endpoint);
  }

  async request(req: TitanRequest): Promise<TitanResponse> {
    await this.socket.send(JSON.stringify(req));
    const [response] = await this.socket.receive();
    return JSON.parse(response.toString());
  }

  async ping(): Promise<boolean> {
    const res = await this.request({ op: 'ping' });
    return res.status === 'ok';
  }

  async gpuInfo(): Promise<TitanResponse> {
    return this.request({ op: 'gpu_info' });
  }

  async matrixMultiply(a: number[][], b: number[][]): Promise<number[][]> {
    const res = await this.request({ op: 'matrix_multiply', a, b });
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
    const info = await client.gpuInfo();
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

### Phase 1: VFIO Setup
- [ ] Enable IOMMU in `/etc/default/grub`
- [ ] Create `/etc/modprobe.d/vfio.conf` with device IDs
- [ ] Update `/etc/mkinitcpio.conf` MODULES
- [ ] Run `mkinitcpio -P`
- [ ] Run `grub-mkconfig -o /boot/grub/grub.cfg`
- [ ] Reboot and verify with `lspci -nnk -s 99:00`

### Phase 2: VM Setup
- [ ] Install qemu, libvirt, virt-manager
- [ ] Create VM disk image
- [ ] Configure VM with GPU passthrough
- [ ] Install Arch Linux in VM

### Phase 3: Guest Configuration
- [ ] Install nvidia-470xx-dkms driver
- [ ] Install CUDA 11.4
- [ ] Verify GPU with nvidia-smi
- [ ] Configure static IP

### Phase 4: Service Setup
- [ ] Install Python + PyTorch in VM
- [ ] Create worker.py service
- [ ] Configure systemd service
- [ ] Test from host

### Phase 5: Integration
- [ ] Add to dashboard health monitoring
- [ ] Create client library
- [ ] Integrate with memOS (optional)

### Phase 6: Operations
- [ ] Enable VM autostart
- [ ] Add to ecosystem.sh
- [ ] Document procedures

---

## Troubleshooting

### IOMMU Group Issues
If the Titan X shares an IOMMU group with other devices:
```bash
# Check IOMMU groups
./scripts/check-iommu-groups.sh

# May need ACS override patch if devices share groups
```

### VM Won't Start with GPU
```bash
# Check for errors
journalctl -u libvirtd -f

# Verify VFIO binding
lspci -nnk -s 99:00

# Check if nvidia driver grabbed it first
lsmod | grep nvidia
```

### Driver Issues in VM
```bash
# In VM: Check dmesg for nvidia errors
dmesg | grep -i nvidia

# Try different driver version
yay -S nvidia-390xx-dkms  # Older fallback
```

### Network Connectivity
```bash
# From host, test VM connectivity
ping 192.168.122.10

# Check libvirt network
virsh net-list --all
virsh net-start default
```

---

## References

- [Arch Wiki: PCI passthrough via OVMF](https://wiki.archlinux.org/title/PCI_passthrough_via_OVMF)
- [NVIDIA Legacy Driver Archive](https://www.nvidia.com/en-us/drivers/unix/)
- [CUDA Toolkit Archive](https://developer.nvidia.com/cuda-toolkit-archive)
- [ZeroMQ Guide](https://zguide.zeromq.org/)
- [libvirt Documentation](https://libvirt.org/docs.html)

---

*Created: 2026-01-19 | Target GPU: GTX Titan X (GM200) 12GB*
