from PIL import Image, ImageDraw

SCALE = 4
SIZE = 512
canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)


def points(values):
    return [(x * SCALE, y * SCALE) for x, y in values]


def polygon(values, fill, outline=None, width=1):
    shape = points(values)
    draw.polygon(shape, fill=fill)
    if outline:
        draw.line(shape + [shape[0]], fill=outline, width=width * SCALE, joint="curve")


def ellipse(box, fill, outline=None, width=1):
    draw.ellipse(tuple(value * SCALE for value in box), fill=fill, outline=outline, width=width * SCALE)


def line(values, fill, width=1):
    draw.line(points(values), fill=fill, width=width * SCALE, joint="curve")


ink = "#352d33"
fur = "#e5b487"
fur_light = "#ffe5b9"
fur_dark = "#9f5d45"
cloak = "#8f3432"
cloak_light = "#d65a3f"
ember = "#ff8a5c"
carrot = "#f57c3e"
carrot_light = "#ffb35b"
leaf = "#5fa64b"

# Tail trails behind the charging body.
ellipse((113, 296, 250, 398), fur_dark, ink, 6)
ellipse((128, 302, 235, 384), fur, None)
line([(148, 333), (207, 355)], fur_light, 10)

# Rear boot, cloak, and side-view body.
ellipse((180, 395, 271, 448), fur_dark, ink, 5)
ellipse((190, 402, 258, 433), fur_light, None)
polygon([(179, 247), (148, 371), (236, 418), (339, 394), (354, 300), (294, 244)], cloak, ink, 7)
polygon([(204, 276), (178, 364), (244, 395), (312, 375), (325, 302), (271, 274)], cloak_light, None)
polygon([(220, 283), (257, 400), (279, 288), (254, 310)], "#f5d7a4", ink, 3)

# Long ears shown in profile, deliberately generic and clear at small scale.
polygon([(211, 175), (197, 66), (253, 155)], fur_dark, ink, 6)
polygon([(244, 164), (268, 73), (292, 176)], fur_dark, ink, 6)
polygon([(212, 134), (208, 93), (237, 157)], "#e79287")
polygon([(266, 157), (276, 99), (284, 162)], "#e79287")

# Side-facing head and muzzle.
ellipse((167, 143, 337, 287), fur, ink, 7)
ellipse((267, 190, 358, 267), fur_light, ink, 4)
ellipse((304, 214, 330, 235), "#44383b", ink, 2)
ellipse((247, 182, 278, 218), "#263541")
ellipse((255, 189, 265, 199), "#ffffff")
line([(323, 240), (307, 252), (288, 250)], ink, 3)
ellipse((205, 217, 240, 237), fur_dark, None)

# Small cloak collar beneath the head.
polygon([(189, 258), (226, 296), (292, 279), (318, 244), (292, 270), (245, 279)], cloak, ink, 4)

# Forward charging boot.
ellipse((292, 383, 383, 436), fur_dark, ink, 5)
ellipse((303, 390, 371, 421), fur_light, None)

# Carrot fire baton points forward and reads as a melee weapon.
line([(286, 314), (404, 270)], ink, 20)
line([(286, 314), (404, 270)], carrot, 14)
polygon([(397, 272), (448, 252), (414, 294)], carrot_light, ink, 4)
polygon([(407, 266), (427, 226), (436, 260)], leaf, ink, 3)
polygon([(421, 257), (456, 229), (446, 270)], leaf, ink, 3)
polygon([(420, 278), (462, 280), (434, 297)], leaf, ink, 3)
ellipse((272, 302, 307, 337), fur_light, ink, 4)

# Ember particles imply motion but do not form a ground shadow or frame.
for x, y, size in [(119, 235, 7), (148, 192, 5), (372, 212, 7), (407, 180, 5), (448, 322, 6)]:
    line([(x - size, y), (x + size, y)], ember, 3)
    line([(x, y - size), (x, y + size)], ember, 3)

canvas.resize((SIZE, SIZE), Image.Resampling.LANCZOS).save(
    "public/images/autochess/portraits/ember-blade.png", "PNG", optimize=True
)
