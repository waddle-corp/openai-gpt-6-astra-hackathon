"""Render the board (deck, trucks, motors) with its all-terrain wheels for the Astra fidelity loop.

blender -b -P scripts/3d/render_board.py -- out.png [angle]
angle: "front" (rear 3/4 hero view like the product photos), "side" (profile), "top" (deck graphics).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))
import board as board_module  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = args[0] if args else "/tmp/board.png"
ANGLE = args[1] if len(args) > 1 else "front"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 1100, 800
world = bpy.data.worlds.new("Studio")
scene.world = world
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0
scene.view_settings.view_transform = "Standard"
scene.view_settings.exposure = -0.5


def material(name, rgb, rough, metal=0.0, coat=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if coat:
        bsdf.inputs["Coat Weight"].default_value = coat
    return mat


# Flat stand-ins for the textured materials in build-3d.py; the loop judges shape and colour.
MATS = {
    "bamboo": material("Bamboo", (0.80, 0.62, 0.36), 0.35, coat=0.5),
    "grip": material("Grip", (0.05, 0.05, 0.05), 0.97),
    "black": material("MattBlack", (0.03, 0.03, 0.03), 0.55, 0.1),
    "gloss": material("GlossBlack", (0.02, 0.02, 0.02), 0.25, 0.3, coat=0.5),
    "alu": material("Aluminium", (0.62, 0.63, 0.65), 0.28, 1.0),
    "steel": material("Steel", (0.45, 0.46, 0.48), 0.4, 1.0),
    "orange": material("Orange", (0.93, 0.27, 0.12), 0.4),
}
RUBBER = material("Rubber", (0.06, 0.06, 0.06), 0.9)

board_module.build(MATS)
s = board_module.SPEC

# The board is ~0.98 m long: keep the camera far enough for the whole deck to fit.
VIEWS = {
    "front": ((0.72, -1.05, 0.52), (-0.05, 0, -0.02), 55),
    "side": ((0.0, -1.55, 0.10), (0, 0, -0.03), 60),
    "top": ((0.0, -0.45, 1.35), (0, 0, 0), 55),
}
loc, target, lens = VIEWS.get(ANGLE, VIEWS["front"])
bpy.ops.object.camera_add(location=loc)
cam = bpy.context.object
cam.data.lens = lens
cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
scene.camera = cam

for light_loc, energy, size in (((-0.9, -1.3, 1.5), 90, 1.8), ((1.1, -0.7, 0.9), 40, 1.4), ((0, 1.2, 1.1), 30, 1.8)):
    bpy.ops.object.light_add(type="AREA", location=light_loc)
    light = bpy.context.object
    light.data.energy, light.data.size = energy, size
    light.rotation_euler = (Vector(target) - light.location).to_track_quat("-Z", "Y").to_euler()

scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print(f"RENDERED {OUT}")
