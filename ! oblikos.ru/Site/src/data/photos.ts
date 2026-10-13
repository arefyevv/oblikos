import sofia from "../assets/photos/sofia.webp"
import cafe from "../assets/photos/cafe.webp"
import office from "../assets/photos/office.webp"
import city from "../assets/photos/city.webp"
import coast from "../assets/photos/coast.webp"
import mia from "../assets/photos/mia.webp"
import alex from "../assets/photos/alex.webp"
import lena from "../assets/photos/lena.webp"
import noah from "../assets/photos/noah.webp"
import aya from "../assets/photos/aya.webp"
import memoryRunning from "../assets/photos/memory-running.webp"
import memoryGallery from "../assets/photos/memory-gallery.webp"
import memoryFashion from "../assets/photos/memory-fashion.webp"

export const photos = {
  memoryRunning: { src: memoryRunning, alt: "София на утренней пробежке вдоль набережной" },
  memoryGallery: { src: memoryGallery, alt: "София знакомится с Алексом в художественной галерее" },
  memoryFashion: { src: memoryFashion, alt: "София снимает модный образ для своего блога" },
  sofia: { src: sofia, alt: "София — девушка с веснушками" },
  cafe: { src: cafe, alt: "София с чашкой кофе в кафе" },
  office: { src: office, alt: "София за рабочим столом в студии" },
  city: { src: city, alt: "София на прогулке по Москве" },
  coast: { src: coast, alt: "София на морском побережье" },
  mia: { src: mia, alt: "Мия — девушка с тёмным каре" },
  alex: { src: alex, alt: "Алекс — мужчина с тёмными волосами" },
  lena: { src: lena, alt: "Лена — девушка со светлыми волосами" },
  noah: { src: noah, alt: "Ноа — мужчина с кудрявыми волосами" },
  aya: { src: aya, alt: "Ая — девушка с чёрными волосами" },
}

export const scenePhotos = {
  violet: photos.sofia,
  blue: photos.city,
  rose: photos.cafe,
  sand: photos.office,
  aqua: photos.coast,
  peach: photos.sofia,
}
