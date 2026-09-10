"""Build a detailed Evolve GTR-style all-terrain board plus dockable parts as a GLB.

Run headless:  blender -b -P scripts/build-3d.py -- public/media/3d/evolve-gtr.glb
Parts are separate named nodes (Battery, Wheels, BeltKit, Charger); the "assemble"
animation moves them from an exploded pose into place. Textures are generated
procedurally here and embedded in the GLB, so no external assets are needed.
"""
import json
import math
import os
import struct
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "3d"))
import board as board_module  # noqa: E402
import street_wheel  # noqa: E402

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "evolve-gtr.glb"
FPS, END = 24, 72
TMP = tempfile.mkdtemp(prefix="astra-3d-")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "assemble"
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, END
rng = np.random.default_rng(7)


# --- textures -----------------------------------------------------------------
def save_image(name, rgb):
    """rgb: float32 array (h, w, 3) in 0..1 → PNG on disk, returned as a Blender image."""
    h, w, _ = rgb.shape
    image = bpy.data.images.new(name, w, h, alpha=True)
    rgba = np.concatenate([rgb, np.ones((h, w, 1), np.float32)], axis=2)
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = os.path.join(TMP, f"{name}.png")
    image.file_format = "PNG"
    image.save()
    return image


def bamboo_texture(size=1024):
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    strip = np.floor(x * 18)  # bamboo strips along the board length
    strip_tone = 0.85 + 0.15 * ((strip * 0.618) % 1.0)
    grain = 0.5 + 0.5 * np.sin((y * 190 + strip * 3.1) + 2.0 * np.sin(x * 40 + strip))
    node = np.clip(1 - 30 * np.abs(((y * 6 + strip * 0.37) % 1.0) - 0.5) ** 2, 0, 1) * 0.35
    noise = rng.normal(0, 0.03, (size, size)).astype(np.float32)
    base = np.array([0.80, 0.62, 0.36], np.float32)
    dark = np.array([0.55, 0.38, 0.18], np.float32)
    mix = np.clip(0.55 * strip_tone + 0.35 * grain - node + noise, 0, 1)[..., None]
    return dark + (base - dark) * mix


def grip_texture(size=512):
    noise = rng.random((size, size)).astype(np.float32)
    speck = (noise > 0.93).astype(np.float32) * 0.10
    tone = 0.035 + 0.02 * noise + speck
    return np.repeat(tone[..., None], 3, axis=2)


def rubber_texture(size=512):
    noise = rng.random((size, size)).astype(np.float32)
    tone = 0.06 + 0.03 * noise
    return np.repeat(tone[..., None], 3, axis=2)


BAMBOO_IMG = save_image("bamboo", bamboo_texture(768))
GRIP_IMG = save_image("grip", grip_texture())
RUBBER_IMG = save_image("rubber", rubber_texture())


def material(name, rgb=(0.5, 0.5, 0.5), rough=0.6, metal=0.0, image=None, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
    if image:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


BAMBOO = material("Bamboo", image=BAMBOO_IMG, rough=0.32, coat=0.6)
GRIP = material("Grip", image=GRIP_IMG, rough=0.98)
RUBBER = material("Rubber", image=RUBBER_IMG, rough=0.92)
# 97mm street wheels (Evolve GTR Street Wheels): urethane ring + slotted black core. Hidden until previewed.
STREET_MATS = street_wheel.materials()
BLACK = material("MattBlack", (0.03, 0.03, 0.03), 0.55, 0.1)
GLOSS = material("GlossBlack", (0.02, 0.02, 0.02), 0.25, 0.3, coat=0.5)
ALU = material("Aluminium", (0.62, 0.63, 0.65), 0.28, 1.0)
STEEL = material("Steel", (0.45, 0.46, 0.48), 0.4, 1.0)
ORANGE = material("Orange", (0.93, 0.27, 0.12), 0.4)
CABLE = material("Cable", (0.05, 0.05, 0.05), 0.7)
LED = material("Led", (0.2, 1.0, 0.35), 0.3)
LED.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (0.2, 1.0, 0.35, 1)
LED.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 3.0


# --- helpers -----------------------------------------------------------------
def finish(obj, mat, parent=None, smooth=True):
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    if smooth:
        try:
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
        except Exception:
            bpy.ops.object.shade_smooth()
    return obj


def box(name, size, loc, mat, parent=None, bevel=0.0, segments=3, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width, mod.segments = bevel, segments
        bpy.ops.object.modifier_apply(modifier="Bevel")
    return finish(obj, mat, parent, smooth=bool(bevel))


def cylinder(name, radius, depth, loc, mat, axis="Y", parent=None, verts=48):
    rot = {"X": (0, math.pi / 2, 0), "Y": (math.pi / 2, 0, 0), "Z": (0, 0, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, parent)


def torus(name, major, minor, loc, mat, parent=None, scale=(1, 1, 1), segs=(64, 24)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=(math.pi / 2, 0, 0), major_segments=segs[0], minor_segments=segs[1])
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return finish(obj, mat, parent)


def group(name, loc=(0, 0, 0)):
    bpy.ops.object.empty_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    return obj


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


def parent_keep(obj, parent):
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()


# --- deck, trucks, motors: the Astra-refined board module ------------------------
BOARD_MATS = {"bamboo": BAMBOO, "grip": GRIP, "black": BLACK, "gloss": GLOSS, "alu": ALU, "steel": STEEL, "orange": ORANGE}
wheels = group("Wheels")
battery = group("Battery")
board = board_module.build(BOARD_MATS, wheels_parent=wheels, battery_parent=battery)
TRUCK_Z = board_module.SPEC["truck_z"]
THICK = board_module.SPEC["thick"]

# --- wheels (part): the board module builds the all-terrain set into `wheels`;
# the street set sits on the same axles, hidden until the shopper previews a colour.
for x in (board_module.SPEC["truck_x"], -board_module.SPEC["truck_x"]):
    for y in (-0.185, 0.185):
        tag = f"{'F' if x > 0 else 'R'}{'L' if y < 0 else 'R'}"
        for obj in street_wheel.build(x, y, TRUCK_Z, tag, STREET_MATS, outward=1 if y > 0 else -1):
            parent_keep(obj, wheels)

# --- belt kit (part): motor pulley, wheel pulley, toothed belt ------------------------
belt = group("BeltKit", (-0.457, 0.152, TRUCK_Z))  # between the drive and wheel pulleys the board module builds
for name, px, radius in (("MotorPulley", -0.03, 0.017), ("WheelPulley", 0.03, 0.026)):
    p = cylinder(name, radius, 0.014, (belt.location.x + px, belt.location.y, belt.location.z), ALU, "Y", verts=36)
    parent_keep(p, belt)
    teeth = []
    count = int(radius * 900)
    for i in range(count):
        a = 2 * math.pi * i / count
        bpy.ops.mesh.primitive_cube_add(size=1, location=(belt.location.x + px + radius * math.cos(a), belt.location.y, belt.location.z + radius * math.sin(a)), rotation=(0, -a, 0))
        t = bpy.context.object
        t.scale = (0.003, 0.014, 0.004)
        bpy.ops.object.transform_apply(scale=True)
        teeth.append(t)
    tset = join(teeth, f"{name}Teeth")
    finish(tset, STEEL, smooth=False)
    parent_keep(tset, belt)
parent_keep(torus("Belt", 0.030, 0.0035, tuple(belt.location), RUBBER, scale=(2.0, 1.6, 0.85), segs=(72, 10)), belt)

# --- charger (part): brick, label, LED, cable, barrel plug -----------------------------
charger = group("Charger", (-0.15, 0.26, board_module.SPEC["truck_z"]))
box("ChargerBrick", (0.16, 0.075, 0.045), (0, 0, 0), GLOSS, charger, bevel=0.008, segments=5)
box("ChargerLabel", (0.09, 0.03, 0.001), (0, 0, 0.023), BLACK, charger)
cylinder("ChargerLed", 0.004, 0.002, (0.055, 0.025, 0.0235), LED, "Z", charger, 16)
cylinder("PlugBarrel", 0.0065, 0.03, (0.0, -0.157, 0), STEEL, "Y", charger, 16)
cylinder("PlugCollar", 0.009, 0.014, (0.0, -0.138, 0), BLACK, "Y", charger, 16)
# Cable: short cylinder segments along a bezier (curve objects misbehave when parented headless).
P0, P1, P2 = Vector((-0.02, -0.0375, 0)), Vector((-0.035, -0.10, -0.012)), Vector((0.0, -0.145, 0))
pts = [P0 * (1 - t) ** 2 + P1 * (2 * (1 - t) * t) + P2 * t ** 2 for t in (i / 13 for i in range(14))]
segments = []
for a, b_ in zip(pts, pts[1:]):
    mid, d = (a + b_) / 2, b_ - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.0035, depth=d.length * 1.15, location=charger.location + mid)
    seg = bpy.context.object
    seg.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    segments.append(seg)
cable = join(segments, "ChargerCable")
finish(cable, CABLE)
parent_keep(cable, charger)

# --- assemble animation ----------------------------------------------------------------
MOVES = [
    (battery, Vector((0, 0, -0.45)), 1, 40),
    (wheels, Vector((0, 0, -0.32)), 8, 50),
    (belt, Vector((-0.32, 0.18, -0.12)), 18, 60),
    (charger, Vector((-0.12, 0.36, -0.18)), 28, END),
]
for obj, offset, start, end in MOVES:
    home = obj.location.copy()
    obj.location = home + offset
    obj.keyframe_insert("location", frame=start)
    obj.location = home
    obj.keyframe_insert("location", frame=end)
    obj.keyframe_insert("location", frame=END)

for obj, *_ in MOVES:
    x, y, z = obj.location
    print(f"HOTSPOT {obj.name} {x:.3f} {z:.3f} {-y:.3f}")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_apply=True,
    export_yup=True,
    export_animations=True,
    export_animation_mode="SCENE",
    export_lights=False,
    export_cameras=False,
)

# --- merge per-object clips into one "assemble" animation ------------------------------
with open(OUT, "rb") as fh:
    data = fh.read()
magic, version, _length = struct.unpack_from("<III", data, 0)
json_len, json_type = struct.unpack_from("<II", data, 12)
gltf = json.loads(data[20 : 20 + json_len])
rest = data[20 + json_len :]
samplers, channels = [], []
for clip in gltf.get("animations", []):
    base = len(samplers)
    samplers.extend(clip["samplers"])
    channels.extend({**ch, "sampler": ch["sampler"] + base} for ch in clip["channels"])
gltf["animations"] = [{"name": "assemble", "samplers": samplers, "channels": channels}]
for mat in gltf["materials"]:
    if mat["name"].startswith("Street"):
        mat["alphaMode"], mat["alphaCutoff"] = "MASK", 0.5
        mat.setdefault("pbrMetallicRoughness", {})["baseColorFactor"] = [*mat["pbrMetallicRoughness"].get("baseColorFactor", [1, 1, 1, 1])[:3], 0.0]
body = json.dumps(gltf, separators=(",", ":")).encode()
body += b" " * (-len(body) % 4)
with open(OUT, "wb") as fh:
    fh.write(struct.pack("<III", magic, version, 12 + 8 + len(body) + len(rest)) + struct.pack("<II", len(body), json_type) + body + rest)
print(f"WROTE {OUT} ({os.path.getsize(OUT) // 1024} KB, {len(gltf['meshes'])} meshes, {len(channels)} animation channels)")
