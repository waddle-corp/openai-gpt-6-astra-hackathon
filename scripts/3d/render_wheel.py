"""Render one street wheel to PNG for the Astra fidelity loop.

blender -b -P scripts/3d/render_wheel.py -- out.png [angle]
angle: "front" (photo-like 3/4 view, default) or "side" (tread profile).
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import street_wheel  # noqa: E402

args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = args[0] if args else "/tmp/street-wheel.png"
ANGLE = args[1] if len(args) > 1 else "front"

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = 900, 700
scene.render.film_transparent = False
world = bpy.data.worlds.new("Studio")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (1, 1, 1, 1)
bg.inputs["Strength"].default_value = 1.0  # white backdrop like the product photos
scene.view_settings.exposure = -0.6
scene.view_settings.view_transform = "Standard"  # keep the urethane colour saturated like the product photo

street_wheel.build(0, 0, 0, "R", outward=-1)  # print faces -Y, towards the camera

# Camera: product-photo style 3/4 view of the printed face, slightly above.
if ANGLE == "side":
    cam_loc, target = (0.0, -0.05, 0.22), (0, 0, 0)
else:
    cam_loc, target = (-0.15, -0.27, 0.08), (0, 0, 0)
bpy.ops.object.camera_add(location=cam_loc)
cam = bpy.context.object

cam.rotation_euler = (Vector(target) - cam.location).to_track_quat("-Z", "Y").to_euler()
cam.data.lens = 70
scene.camera = cam

bpy.ops.object.light_add(type="AREA", location=(-0.3, -0.4, 0.5))
key = bpy.context.object
key.data.energy, key.data.size = 7, 0.7
key.rotation_euler = (Vector((0, 0, 0)) - key.location).to_track_quat("-Z", "Y").to_euler()
bpy.ops.object.light_add(type="AREA", location=(0.4, -0.2, 0.3))
fill = bpy.context.object
fill.data.energy, fill.data.size = 3, 0.9
fill.rotation_euler = (Vector((0, 0, 0)) - fill.location).to_track_quat("-Z", "Y").to_euler()

scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print(f"RENDERED {OUT}")
